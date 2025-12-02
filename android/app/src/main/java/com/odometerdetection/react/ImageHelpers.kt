package com.odometerdetection.react

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeMap
import com.facebook.react.bridge.WritableNativeArray
import com.google.firebase.ml.custom.*
import java.io.File
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.channels.FileChannel
import org.tensorflow.lite.Interpreter

class ImageHelpers(reactContext: ReactApplicationContext) :
        ReactContextBaseJavaModule(reactContext) {
    override fun getName() = "ImageHelpers"

    @ReactMethod
    fun loadImageForTFLite(path: String, promise: Promise) {
        try {
            val file = File(path)
            val bitmap = BitmapFactory.decodeFile(file.absolutePath)
            val resized = Bitmap.createScaledBitmap(bitmap, 640, 640, true)

            val inputArray = Arguments.createArray()
            for (y in 0 until 640) {
                for (x in 0 until 640) {
                    val px = resized.getPixel(x, y)
                    val r = (px shr 16 and 0xFF) / 255.0
                    val g = (px shr 8 and 0xFF) / 255.0
                    val b = (px and 0xFF) / 255.0
                    inputArray.pushDouble(r)
                    inputArray.pushDouble(g)
                    inputArray.pushDouble(b)
                }
            }

            promise.resolve(inputArray)
        } catch (e: Exception) {
            promise.reject("ERROR", e)
        }
    }

    fun loadModelFileFromAssets(context: ReactApplicationContext, filename: String): ByteBuffer {
        val assetFileDescriptor = context.assets.openFd(filename)
        val inputStream = FileInputStream(assetFileDescriptor.fileDescriptor)
        val fileChannel = inputStream.channel
        val startOffset = assetFileDescriptor.startOffset
        val declaredLength = assetFileDescriptor.declaredLength
        return fileChannel.map(FileChannel.MapMode.READ_ONLY, startOffset, declaredLength)
    }

    @ReactMethod
    fun detectOdometer(imagePath: String, promise: Promise) {
        try {
            val bitmap = BitmapFactory.decodeFile(imagePath)
            if (bitmap == null) {
                promise.reject("BITMAP_ERROR", "Gagal decode gambar dari path: $imagePath")
                return
            }

            val resized = Bitmap.createScaledBitmap(bitmap, 640, 640, true)

            // Buat input buffer (float32, shape: [1, 640, 640, 3])
            val inputBuffer = ByteBuffer.allocateDirect(1 * 640 * 640 * 3 * 4)
            inputBuffer.order(ByteOrder.nativeOrder())

            for (y in 0 until 640) {
                for (x in 0 until 640) {
                    val pixel = resized.getPixel(x, y)
                    inputBuffer.putFloat(Color.red(pixel) / 255.0f)
                    inputBuffer.putFloat(Color.green(pixel) / 255.0f)
                    inputBuffer.putFloat(Color.blue(pixel) / 255.0f)
                }
            }

            // Load model dari assets
            val modelBuffer =
                    loadModelFileFromAssets(reactApplicationContext, "best_float32.tflite")
            val interpreter = Interpreter(modelBuffer)

            // Output buffer [1, 300, 6]
            val outputBuffer = Array(1) { Array(300) { FloatArray(6) } }
            interpreter.run(inputBuffer, outputBuffer)

            // Proses hasil
            val results = mutableListOf<Pair<Float, Int>>()
            val threshold = 0.5f

            for (i in 0 until 300) {
                val det = outputBuffer[0][i]
                val score = det[4]
                val classId = det[5].toInt()

                if (score > threshold && classId != 10 && classId != 11) {
                    val xCenter = det[0]
                    results.add(Pair(xCenter, classId))
                }
            }

            // Urutkan berdasarkan posisi x
            val sorted = results.sortedBy { it.first }
            val classSequence = sorted.map { it.second.toString() }
            val odometerText = classSequence.joinToString("")

            // Kirim ke React Native
            val result = WritableNativeMap()
            result.putString("odometerText", odometerText)

            val classArray = WritableNativeArray()
            classSequence.forEach { classArray.pushString(it) }
            result.putArray("classSequence", classArray)

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("TFLITE_ERROR", e.message, e)
        }
    }
}
