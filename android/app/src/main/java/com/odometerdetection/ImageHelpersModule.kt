package com.odometerdetection

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.media.ExifInterface
import com.facebook.react.bridge.*
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel
import kotlin.math.max
import kotlin.math.min
import org.tensorflow.lite.Interpreter

// Data class untuk deteksi kotak
data class BoxDetection(
    val box: FloatArray,
    val confidence: Float,
    val label: String
)

// Data class untuk ringkasan prediksi
data class PredictionSummary(
    val value: String,
    val type: String?,
    val digitCount: Int,
    val avgConfidence: Float
)

// Data class untuk hasil letterbox
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

    // Load model from assets
    private fun loadModel() {
        try {
            val assetManager = reactApplicationContext.assets
            val modelPath = "weightsfull_float16.tflite"
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

    private fun loadModelFile(fd: android.content.res.AssetFileDescriptor): MappedByteBuffer {
        val inputStream = FileInputStream(fd.fileDescriptor)
        val channel = inputStream.channel
        return channel.map(FileChannel.MapMode.READ_ONLY, fd.startOffset, fd.declaredLength)
    }

    @ReactMethod
    fun detectOdometer(imagePath: String, promise: Promise) {
        if (tfliteInterpreter == null) {
            promise.reject("MODEL_ERROR", "TFLite interpreter is not initialized.")
            return
        }

        try {
            // Log device info
            val sdk = android.os.Build.VERSION.SDK_INT
            val model = android.os.Build.MODEL ?: "unknown"
            android.util.Log.d("DETECT_INFO", "detectOdometer called on SDK=$sdk model=$model path=$imagePath")

            // 1. PREPARE DECODING (Downsampling to prevent OOM)
            val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            
            // Handle content:// vs file:// for bounds checking
            if (imagePath.startsWith("content://")) {
                val uri = android.net.Uri.parse(imagePath)
                reactApplicationContext.contentResolver.openInputStream(uri).use { stream ->
                    if (stream == null) {
                        promise.reject("IMAGE_ERROR", "Cannot open content uri: $imagePath")
                        return
                    }
                    BitmapFactory.decodeStream(stream, null, options)
                }
            } else {
                val filePath = imagePath.removePrefix("file://")
                BitmapFactory.decodeFile(filePath, options)
            }

            // Calculate inSampleSize
            val maxDim = 1600
            var inSample = 1
            val width = options.outWidth
            val height = options.outHeight
            if (width > 0 && height > 0) {
                while (width / inSample > maxDim || height / inSample > maxDim) {
                    inSample *= 2
                }
            }
            val decodeOptions = BitmapFactory.Options().apply {
                inSampleSize = inSample
                inPreferredConfig = Bitmap.Config.ARGB_8888
            }

            // 2. DECODE BITMAP
            var original: Bitmap? = try {
                if (imagePath.startsWith("content://")) {
                    val uri = android.net.Uri.parse(imagePath)
                    reactApplicationContext.contentResolver.openInputStream(uri).use { stream ->
                        BitmapFactory.decodeStream(stream, null, decodeOptions)
                    }
                } else {
                    val filePath = imagePath.removePrefix("file://")
                    BitmapFactory.decodeFile(filePath, decodeOptions)
                }
            } catch (oom: OutOfMemoryError) {
                System.gc()
                promise.reject("MEMORY_ERROR", "OutOfMemory while decoding image")
                return
            }

            if (original == null) {
                promise.reject("IMAGE_ERROR", "Failed to decode image: $imagePath")
                return
            }

            // 3. FIX ROTATION (PERBAIKAN FINAL)
            // Bagian ini sekarang menangani Content URI (Samsung/Pixel) DAN File Path (Xiaomi/Poco)
            try {
                var rotationInDegrees = 0
                
                if (imagePath.startsWith("content://")) {
                    val uri = android.net.Uri.parse(imagePath)
                    reactApplicationContext.contentResolver.openInputStream(uri)?.use { inputStream ->
                        // Baca EXIF langsung dari Stream
                        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N) {
                            val exifInterface = ExifInterface(inputStream)
                            val orientation = exifInterface.getAttributeInt(
                                ExifInterface.TAG_ORIENTATION,
                                ExifInterface.ORIENTATION_UNDEFINED
                            )
                            rotationInDegrees = when (orientation) {
                                ExifInterface.ORIENTATION_ROTATE_90 -> 90
                                ExifInterface.ORIENTATION_ROTATE_180 -> 180
                                ExifInterface.ORIENTATION_ROTATE_270 -> 270
                                else -> 0
                            }
                        }
                    }
                } else {
                    val filePath = imagePath.removePrefix("file://")
                    val exifInterface = ExifInterface(filePath)
                    val orientation = exifInterface.getAttributeInt(
                        ExifInterface.TAG_ORIENTATION,
                        ExifInterface.ORIENTATION_UNDEFINED
                    )
                    rotationInDegrees = when (orientation) {
                        ExifInterface.ORIENTATION_ROTATE_90 -> 90
                        ExifInterface.ORIENTATION_ROTATE_180 -> 180
                        ExifInterface.ORIENTATION_ROTATE_270 -> 270
                        else -> 0
                    }
                }

                // EKSEKUSI PEMUTARAN (Berlaku untuk SEMUA HP)
                if (rotationInDegrees != 0) {
                    val matrix = Matrix()
                    matrix.postRotate(rotationInDegrees.toFloat())
                    
                    val rotatedBitmap = Bitmap.createBitmap(
                        original, 0, 0, original.width, original.height, matrix, true
                    )
                    
                    if (original != rotatedBitmap) {
                        original.recycle()
                    }
                    original = rotatedBitmap
                    android.util.Log.d("ROTATION_INFO", "Rotated image by $rotationInDegrees degrees")
                }

            } catch (e: Exception) {
                android.util.Log.e("ROTATION_ERROR", "Failed to correct orientation", e)
                // Jika rotasi gagal, lanjut pakai gambar original apa adanya
            }

            // 4. INFERENCE (Run Predictions)
            val fullSummary = try {
                runPredictionPass(original!!, isCenterCrop = false)
            } catch (oom: OutOfMemoryError) {
                original!!.recycle()
                System.gc()
                promise.reject("MEMORY_ERROR", "OOM during inference")
                return
            }

            val cropSummary = try {
                runPredictionPass(original!!, isCenterCrop = true)
            } catch (oom: OutOfMemoryError) {
                android.util.Log.w("DETECT_WARN", "OOM during crop pass, continuing with fullSummary")
                PredictionSummary("", null, 0, 0f)
            }

            // 5. CHOOSE BEST RESULT
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

            // 6. CLEANUP & RESOLVE
            if (!original!!.isRecycled) {
                original.recycle()
            }
            System.gc()

            val result = Arguments.createMap().apply {
                putString("value", best.value)
                putString("type", best.type ?: "Tidak Terdeteksi")
                putDouble("confidence", best.avgConfidence.toDouble())
                putString("detectionMethod", decision)
                putInt("sdk", sdk)
                putString("deviceModel", model)
            }

            promise.resolve(result)
        } catch (e: Exception) {
            android.util.Log.e("DETECT_ERROR", "Detection failed", e)
            System.gc()
            promise.reject("DETECT_ERROR", e.message ?: "unknown")
        }
    }

    // --- HELPER FUNCTIONS REMAIN UNCHANGED ---

    private fun runPredictionPass(source: Bitmap, isCenterCrop: Boolean): PredictionSummary {
        var tempBitmap: Bitmap? = null
        try {
            if (isCenterCrop) {
                val ratio = source.width.toFloat() / source.height.toFloat()
                if (ratio < 0.6f || ratio > 1.7f) {
                    return PredictionSummary("", null, 0, 0f)
                }
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

    private fun runInference(bitmap: Bitmap): List<BoxDetection> {
        val inputBuffer = preprocessImage(bitmap, modelInputSize)
        val outputShape = tfliteInterpreter?.getOutputTensor(0)?.shape() ?: intArrayOf(1, 16, 8400)
        val output = Array(outputShape[0]) { Array(outputShape[1]) { FloatArray(outputShape[2]) } }

        tfliteInterpreter?.run(inputBuffer, output)
        return getRawDetections(output)
    }

    private fun parseDetections(detections: List<BoxDetection>): PredictionSummary {
        val digits = detections.filter { it.label.matches(Regex("^[0-9]$")) }.toMutableList()
        val typeDetect