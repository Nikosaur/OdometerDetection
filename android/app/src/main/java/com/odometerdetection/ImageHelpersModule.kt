package com.odometerdetection

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import com.facebook.react.bridge.*
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel
import kotlin.math.max
import kotlin.math.min
import org.tensorflow.lite.Interpreter

data class BoxDetection(
    val box: FloatArray,
    val confidence: Float,
    val label: String
)

data class PredictionSummary(
    val value: String,
    val type: String?,
    val digitCount: Int,
    val avgConfidence: Float
)

data class LetterboxResult(
    val bitmap: Bitmap,
    val scale: Float,
    val padX: Float,
    val padY: Float,
    val targetSize: Int
)

class ImageHelpersModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ImageHelpers"

    private var tfliteInterpreter: Interpreter? = null
    private var modelInputSize = 640

    init {
        loadModel()
    }

    // load model dari assets
    private fun loadModel() {
        try {
            val assetManager = reactApplicationContext.assets
            val modelPath = "weights_float32.tflite"
            val afd = assetManager.openFd(modelPath)
            val modelBuffer = loadModelFile(afd)
            val options = Interpreter.Options()
            tfliteInterpreter = Interpreter(modelBuffer, options)

            val inputTensor = tfliteInterpreter?.getInputTensor(0)
            val inputShape = inputTensor?.shape()
            if (inputShape != null && inputShape.size >= 3) {
                modelInputSize = inputShape[1]
                android.util.Log.d("MODEL_INFO", "Model input size: $modelInputSize")
            }
        } catch (e: Exception) {
            android.util.Log.e("MODEL_ERROR", "Failed to load TFLite model", e)
        }
    }

    // Fungsi load model file
    private fun loadModelFile(fd: android.content.res.AssetFileDescriptor): MappedByteBuffer {
        val inputStream = FileInputStream(fd.fileDescriptor)
        val channel = inputStream.channel
        return channel.map(FileChannel.MapMode.READ_ONLY, fd.startOffset, fd.declaredLength)
    }

    // Menjalankan deteksi odometer
    @ReactMethod
    fun detectOdometer(imagePath: String, promise: Promise) {
        if (tfliteInterpreter == null) {
            promise.reject("MODEL_ERROR", "TFLite interpreter is not initialized.")
            return
        }

        try {
            val original = BitmapFactory.decodeFile(imagePath)
            if (original == null) {
                promise.reject("IMAGE_ERROR", "Failed to decode image file: $imagePath")
                return
            }

            val fullSummary = runPredictionPass(original, isCenterCrop = false)

            val cropSummary = runPredictionPass(original, isCenterCrop = true)

            var best = fullSummary
            var decision = "Original"

            if (cropSummary.digitCount > fullSummary.digitCount) {
                best = cropSummary
                decision = "Cropped"
            } else if (cropSummary.digitCount == fullSummary.digitCount && fullSummary.digitCount > 0) {
                if (cropSummary.type != null && fullSummary.type == null) {
                    best = cropSummary
                    decision = "Cropped"
                } else if (cropSummary.avgConfidence > fullSummary.avgConfidence) {
                    best = cropSummary
                    decision = "Cropped"
                }
            }

            original.recycle()

            val result = Arguments.createMap()
            result.putString("value", best.value)
            result.putString("type", best.type ?: "Tidak Terdeteksi")
            result.putDouble("confidence", best.avgConfidence.toDouble())
            result.putString("detectionMethod", decision)

            promise.resolve(result)
        } catch (e: Exception) {
            android.util.Log.e("DETECT_ERROR", "Detection failed", e)
            promise.reject("DETECT_ERROR", e.message)
        }
    }

    // Menjalankan satu pass prediksi (dengan atau tanpa crop)
    private fun runPredictionPass(source: Bitmap, isCenterCrop: Boolean): PredictionSummary {
        var tempBitmap: Bitmap? = null
        try {
            if (isCenterCrop) {
                val ratio = source.width.toFloat() / source.height.toFloat()
                if (ratio < 0.6f || ratio > 1.7f) {
                    return PredictionSummary("", null, 0, 0f)
                }

                // Buat center crop
                tempBitmap = cropCenterWithMargin(source, modelInputSize, modelInputSize, marginPx = 60)
            } else {
                val lb = letterboxBitmap(source, modelInputSize)
                tempBitmap = lb.bitmap
            }

            val detections = runInference(tempBitmap)
            return parseDetections(detections)
        } finally {
            tempBitmap?.let {
                if (!it.isRecycled) it.recycle()
            }
        }
    }

    // Menjalankan tflite inference
    private fun runInference(bitmap: Bitmap): List<BoxDetection> {
        val inputBuffer = preprocessImage(bitmap, modelInputSize)

        val outputShape = tfliteInterpreter?.getOutputTensor(0)?.shape() ?: intArrayOf(1, 16, 8400)
        val output = Array(outputShape[0]) { Array(outputShape[1]) { FloatArray(outputShape[2]) } }

        tfliteInterpreter?.run(inputBuffer, output)
        return getRawDetections(output)
    }

    // Fungsi untuk parsing deteksi menjadi ringkasan prediksi
    private fun parseDetections(detections: List<BoxDetection>): PredictionSummary {
        val digits = detections.filter { it.label.matches(Regex("^[0-9]$")) }.toMutableList()
        val typeDetections = detections.filter { it.label == "analog" || it.label == "digital" }
        val bestType = typeDetections.maxByOrNull { it.confidence }?.label

        if (digits.isEmpty()) {
            return PredictionSummary("", bestType, 0, 0f)
        }

        digits.sortBy { it.box[0] }

        val value = digits.joinToString("") { it.label }
        val avgConf = digits.map { it.confidence }.average().toFloat()

        return PredictionSummary(value, bestType, digits.size, avgConf)
    }

    // Fungsi crop center dengan margin
    private fun cropCenterWithMargin(source: Bitmap, targetW: Int, targetH: Int, marginPx: Int): Bitmap {
        val imgW = source.width
        val imgH = source.height

        val desiredW = targetW + marginPx
        val desiredH = targetH + marginPx

        var cropX = (imgW - desiredW) / 2
        var cropY = (imgH - desiredH) / 2
        var cropW = desiredW
        var cropH = desiredH

        if (cropX < 0) { cropX = 0; cropW = imgW }
        if (cropY < 0) { cropY = 0; cropH = imgH }

        val largeCrop = Bitmap.createBitmap(source, cropX, cropY, cropW, cropH)
        val resized = Bitmap.createScaledBitmap(largeCrop, targetW, targetH, true)
        largeCrop.recycle()
        return resized
    }

    // Fungsi letterbox
    private fun letterboxBitmap(source: Bitmap, targetSize: Int): LetterboxResult {
        val originalWidth = source.width
        val originalHeight = source.height
        val scale = min(targetSize.toFloat() / originalWidth, targetSize.toFloat() / originalHeight)
        val newWidth = (originalWidth * scale).toInt()
        val newHeight = (originalHeight * scale).toInt()

        val background = Bitmap.createBitmap(targetSize, targetSize, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(background)
        canvas.drawColor(Color.BLACK)

        val padX = (targetSize - newWidth) / 2f
        val padY = (targetSize - newHeight) / 2f

        val scaled = Bitmap.createScaledBitmap(source, newWidth, newHeight, true)
        canvas.drawBitmap(scaled, padX, padY, Paint())
        scaled.recycle()

        return LetterboxResult(background, scale, padX, padY, targetSize)
    }

    // Fungsi preprocessing gambar menjadi input tensor
    private fun preprocessImage(bitmap: Bitmap, targetSize: Int): ByteBuffer {
        val scaled = if (bitmap.width != targetSize || bitmap.height != targetSize) {
            Bitmap.createScaledBitmap(bitmap, targetSize, targetSize, true)
        } else {
            bitmap
        }

        val inputBuffer = ByteBuffer.allocateDirect(1 * targetSize * targetSize * 3 * 4)
        inputBuffer.order(ByteOrder.nativeOrder())
        val intValues = IntArray(targetSize * targetSize)
        scaled.getPixels(intValues, 0, targetSize, 0, 0, targetSize, targetSize)

        for (pixel in intValues) {
            val r = ((pixel shr 16) and 0xFF) / 255.0f
            val g = ((pixel shr 8) and 0xFF) / 255.0f
            val b = (pixel and 0xFF) / 255.0f
            inputBuffer.putFloat(r)
            inputBuffer.putFloat(g)
            inputBuffer.putFloat(b)
        }
        inputBuffer.rewind()

        if (scaled !== bitmap) scaled.recycle()
        return inputBuffer
    }

    // Ekstrak deteksi raw dari output model
    private fun getRawDetections(output: Array<Array<FloatArray>>): List<BoxDetection> {
        val classNames = listOf("0","1","2","3","4","5","6","7","8","9","analog","digital")
        val confThreshold = 0.3f
        val iouThreshold = 0.5f

        val all = mutableListOf<BoxDetection>()
        val channels = output[0]
        val numAnchors = channels[0].size

        for (i in 0 until numAnchors) {
            var maxClassIndex = -1
            var maxClassConf = 0.0f
            for (j in 4 until (4 + classNames.size)) {
                val conf = channels[j][i]
                if (conf > maxClassConf) {
                    maxClassConf = conf
                    maxClassIndex = j - 4
                }
            }

            if (maxClassConf > confThreshold && maxClassIndex >= 0 && maxClassIndex < classNames.size) {
                val label = classNames[maxClassIndex]
                val cx = channels[0][i]
                val cy = channels[1][i]
                val w = channels[2][i]
                val h = channels[3][i]

                val x1 = cx - w / 2
                val y1 = cy - h / 2
                val x2 = cx + w / 2
                val y2 = cy + h / 2

                all.add(BoxDetection(floatArrayOf(x1, y1, x2, y2), maxClassConf, label))
            }
        }

        return applyNMS(all, iouThreshold)
    }

    // Fungsi Non-Maximum Suppression untuk menyaring deteksi
    private fun applyNMS(detections: List<BoxDetection>, iouThreshold: Float): List<BoxDetection> {
        val sorted = detections.sortedByDescending { it.confidence }.toMutableList()
        val kept = mutableListOf<BoxDetection>()
        while (sorted.isNotEmpty()) {
            val best = sorted.removeAt(0)
            kept.add(best)
            val iterator = sorted.iterator()
            while (iterator.hasNext()) {
                val next = iterator.next()
                if (calculateIoU(best.box, next.box) > iouThreshold) {
                    iterator.remove()
                }
            }
        }
        return kept
    }

    // Fungsi untuk menghitung IoU (Intersection over Union) antara dua box
    private fun calculateIoU(box1: FloatArray, box2: FloatArray): Float {
        val x1 = max(box1[0], box2[0])
        val y1 = max(box1[1], box2[1])
        val x2 = min(box1[2], box2[2])
        val y2 = min(box1[3], box2[3])
        val inter = max(0f, x2 - x1) * max(0f, y2 - y1)
        val a1 = max(0f, box1[2] - box1[0]) * max(0f, box1[3] - box1[1])
        val a2 = max(0f, box2[2] - box2[0]) * max(0f, box2[3] - box2[1])
        val union = a1 + a2 - inter
        return if (union > 0f) inter / union else 0f
    }
}
