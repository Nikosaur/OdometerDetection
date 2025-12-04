import {useState, useEffect, useRef, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  NativeModules,
  Alert,
  ActivityIndicator,
  AppState,
  Image,
  Platform,
} from 'react-native';
import {Camera, useCameraDevice} from 'react-native-vision-camera';
import {launchImageLibrary} from 'react-native-image-picker';
import {Share as RNShare} from 'react-native';
import {captureScreen} from 'react-native-view-shot';
import RNFS from 'react-native-fs';

let ShareLib: any = null;
try {
  ShareLib = require('react-native-share').default;
} catch (e) {
  console.log('react-native-share not available, using built-in Share API');
}

// TypeScript interfaces
interface DetectionResult {
  type: string;
  value: string;
  confidence: number;
  digitCount?: number;
  isValid?: boolean;
  wasCropped?: boolean;
  detectionMethod?: string;
}

interface ImageHelpersModule {
  detectOdometer(
    path: string,
    cropRegion?: {x: number; y: number; w: number; h: number},
  ): Promise<DetectionResult>;
}

const OdometerDetectionScreen = () => {
  const camera = useRef<Camera>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [cameraActive, setCameraActive] = useState(true);
  const device = useCameraDevice('back');
  const [odometerType, setOdometerType] = useState('');
  const [odometerValue, setOdometerValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);
  const [cameraKey, setCameraKey] = useState(0);
  const [isResultMode, setIsResultMode] = useState(false);
  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);

  const removeFilePrefix = (filePath: string) => {
    return filePath.replace(/^file:\/\//, '');
  };

  // Cleanup temp files
  const cleanupTempFiles = useCallback(async () => {
    try {
      const cacheDir = RNFS.CachesDirectoryPath;
      const files = await RNFS.readDir(cacheDir);

      // Delete files older than 15 minutes
      const now = Date.now();
      const FIFTEEN_MINUTES = 15 * 60 * 1000;

      for (const file of files) {
        if (file.mtime !== undefined) {
          const fileAge = now - (file.mtime as Date).getTime();
          if (fileAge > FIFTEEN_MINUTES) {
            await RNFS.unlink(file.path).catch(err =>
              console.warn('Failed to delete:', file.name, err),
            );
          }
        }
      }
    } catch (error) {
      console.warn('Cleanup error:', error);
    }
  }, []);

  // Periodic cleanup every 10 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      cleanupTempFiles();
    }, 10 * 60 * 1000);

    return () => clearInterval(interval);
  }, [cleanupTempFiles]);

  // Cleanup on unmount and app background
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      setAppState(state);

      if (state === 'active') {
        setCameraActive(true);
        setCameraKey(k => k + 1);
      } else {
        setCameraActive(false);
        cleanupTempFiles();
      }
    });

    return () => {
      sub.remove();
      cleanupTempFiles();
    };
  }, [cleanupTempFiles]);

  useEffect(() => {
    const requestCameraPermission = async () => {
      try {
        let status = await Camera.getCameraPermissionStatus();
        console.log('Current permission status:', status);

        if (status === 'not-determined' || status === 'denied') {
          console.log('Requesting camera permission...');
          status = await Camera.requestCameraPermission();
          console.log('Permission after request:', status);
        }

        const granted = status === 'granted';
        console.log('Permission granted:', granted);
        setHasPermission(granted);
      } catch (error) {
        console.error('Permission error:', error);
        setHasPermission(false);
      }
    };

    requestCameraPermission();

    return () => {
      setCameraActive(false);
    };
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      setAppState(state);

      if (state === 'active') {
        setCameraActive(true);
        setCameraKey(k => k + 1);
      } else {
        setCameraActive(false);
      }
    });

    return () => sub.remove();
  }, []);

  const resetDetection = useCallback(() => {
    setOdometerType('');
    setOdometerValue('');
  }, []);

  const resetToCamera = useCallback(() => {
    setIsResultMode(false);

    // Cleanup captured image file if it exists
    if (capturedImageUri) {
      const filePath = removeFilePrefix(capturedImageUri);
      RNFS.unlink(filePath).catch(err =>
        console.warn('Failed to delete image:', err),
      );
      if (Platform.OS === 'android') {
        Image.getSize(
          capturedImageUri,
          () => {},
          () => {},
        );
      }
    }

    setCapturedImageUri(null);
    resetDetection();
    setCameraActive(true);
  }, [capturedImageUri, resetDetection]);

  const handleDetectionResult = useCallback(
    (imageData: DetectionResult | null) => {
      console.log('Image data:', imageData);
      setLoading(false);
      setIsProcessing(false);

      // Cleanup immediately after processing
      cleanupTempFiles();

      if (!imageData) {
        Alert.alert('Error', 'Tidak ada data yang dikembalikan dari model.', [
          {text: 'OK', onPress: resetToCamera},
        ]);
        return;
      }

      const detectedType = imageData?.type || 'Unknown';
      const detectedValue = imageData?.value || '';
      const confidence = imageData?.confidence || 0;
      // const digitCount = imageData?.digitCount || 0;
      const isValid = imageData?.isValid !== false;
      // const wasCropped = imageData?.wasCropped || false;
      // const detectionMethod = imageData?.detectionMethod || 'Unknown';

      // Log detection info
      console.log('=== DETECTION INFO ===');
      console.log('Type:', detectedType);
      console.log('Value:', detectedValue);
      console.log('Confidence:', (confidence * 100).toFixed(1) + '%');
      // console.log('Digit Count:', digitCount);
      // console.log('Is Valid:', isValid);
      // console.log('Was Cropped:', wasCropped);
      // console.log('Detection Method:', detectionMethod);
      console.log('=====================');

      // DETECTION INFO
      if (!detectedValue || detectedValue === '') {
        setOdometerType('Tidak Terdeteksi');
        setOdometerValue('-');
        Alert.alert(
          'Gagal Mendeteksi',
          'Odometer tidak ditemukan. Pastikan:\n• Foto tidak buram\n• Pencahayaan cukup\n• Odometer terlihat jelas',
          [
            {
              text: 'Foto Ulang',
              onPress: resetToCamera,
              style: 'destructive',
            },
          ],
        );
        return;
      }

      if (confidence < 0.3) {
        setOdometerType(detectedType);
        setOdometerValue(detectedValue);
        Alert.alert(
          'Kualitas Sangat Rendah',
          `Model sangat tidak yakin dengan hasil ini.\n\nKeyakinan: ${(
            confidence * 100
          ).toFixed(
            0,
          )}%\nNilai: ${detectedValue}\n\nSangat disarankan untuk foto ulang.`,
          [
            {
              text: 'Foto Ulang',
              onPress: resetToCamera,
              style: 'destructive',
            },
            {text: 'Tetap Gunakan', style: 'cancel'},
          ],
        );
        return;
      }

      if (confidence < 0.5) {
        setOdometerType(detectedType);
        setOdometerValue(detectedValue);
        Alert.alert(
          'Peringatan: Kualitas Foto Rendah',
          `Model ragu dengan hasil ini.\n\nKeyakinan: ${(
            confidence * 100
          ).toFixed(
            0,
          )}%\nNilai: ${detectedValue}\n\nDisarankan untuk foto ulang.`,
          [
            {
              text: 'Foto Ulang',
              onPress: resetToCamera,
              style: 'destructive',
            },
            {text: 'Gunakan Hasil Ini', style: 'cancel'},
          ],
        );
        return;
      }

      if (detectedValue.length < 4) {
        setOdometerType(detectedType);
        setOdometerValue(detectedValue);
        Alert.alert(
          'Peringatan: Nilai Tidak Sesuai',
          `Nilai terlalu pendek (${detectedValue.length} digit).\n\nNilai: ${detectedValue}\n\nOdometer biasanya memiliki 4-7 digit.`,
          [
            {
              text: 'Foto Ulang',
              onPress: resetToCamera,
              style: 'destructive',
            },
            {text: 'Gunakan Hasil Ini', style: 'cancel'},
          ],
        );
        return;
      }

      if (detectedValue.length > 7) {
        setOdometerType(detectedType);
        setOdometerValue(detectedValue);
        Alert.alert(
          'Peringatan: Nilai Tidak Sesuai',
          `Nilai terlalu panjang (${detectedValue.length} digit).\n\nNilai: ${detectedValue}\n\nOdometer biasanya memiliki 4-7 digit.`,
          [
            {
              text: 'Foto Ulang',
              onPress: resetToCamera,
              style: 'destructive',
            },
            {text: 'Gunakan Hasil Ini', style: 'cancel'},
          ],
        );
        return;
      }

      if (!isValid) {
        setOdometerType(detectedType);
        setOdometerValue(detectedValue);
        Alert.alert(
          'Peringatan: Deteksi Tidak Konsisten',
          `Angka yang terdeteksi mungkin tidak berurutan dengan benar.\n\nNilai: ${detectedValue}\nKeyakinan: ${(
            confidence * 100
          ).toFixed(0)}%`,
          [
            {
              text: 'Foto Ulang',
              onPress: resetToCamera,
              style: 'destructive',
            },
            {text: 'Gunakan Hasil Ini', style: 'cancel'},
          ],
        );
        return;
      }

      setOdometerType(detectedType);
      setOdometerValue(detectedValue);
    },
    [resetDetection, resetToCamera, cleanupTempFiles],
  );

  const processImage = useCallback(
    async (imagePath: string, imageUri?: string) => {
      const {ImageHelpers} = NativeModules as {
        ImageHelpers: ImageHelpersModule;
      };

      setLoading(true);
      setIsProcessing(true);
      resetDetection();

      if (imageUri) {
        setCapturedImageUri(imageUri);
      } else {
        setCapturedImageUri(`file://${imagePath}`);
      }
      setIsResultMode(true);
      setCameraActive(false);

      setTimeout(() => {
        ImageHelpers.detectOdometer(imagePath)
          .then((imageData: DetectionResult) =>
            handleDetectionResult(imageData),
          )
          .catch((err: any) => {
            console.error('Detection error:', err);
            setLoading(false);
            setIsProcessing(false);

            cleanupTempFiles();

            let errorMessage = 'Terjadi kesalahan sistem.';

            if (err.code === 'IMAGE_ERROR') {
              errorMessage = 'Gagal memuat gambar. Pastikan file valid.';
            } else if (err.code === 'IMAGE_QUALITY') {
              errorMessage = `Kualitas gambar tidak memadai: ${err.message}`;
            } else if (err.code === 'MEMORY_ERROR') {
              errorMessage =
                'Memori tidak cukup. Coba dengan gambar lebih kecil.';
            } else if (err.code === 'MODEL_ERROR') {
              errorMessage = 'Model AI belum dimuat dengan benar.';
            }

            Alert.alert('Error', errorMessage, [
              {text: 'OK', onPress: () => resetToCamera()},
            ]);
          });
      }, 500);
    },
    [handleDetectionResult, resetDetection, resetToCamera],
  );

  const takePhoto = useCallback(async () => {
    if (isProcessing || !device || !camera.current) {
      console.log('Cannot take photo: processing or no device');
      return;
    }

    try {
      const photo = await camera.current.takePhoto();
      if (photo?.path) {
        await processImage(photo.path, `file://${photo.path}`);
      }
    } catch (err) {
      console.error('Camera error:', err);
      Alert.alert('Error', 'Gagal mengambil foto. Coba lagi.');
      setIsProcessing(false);
    }
  }, [isProcessing, device, processImage]);

  const selectImageFromGallery = useCallback(async () => {
    if (isProcessing) {
      console.log('Already processing an image');
      return;
    }

    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        quality: 1,
      });

      if (result.assets && result.assets.length > 0) {
        const selectedImage = result.assets[0];
        if (selectedImage.uri) {
          const imagePath = removeFilePrefix(selectedImage.uri);
          await processImage(imagePath, selectedImage.uri);
        }
      }
    } catch (err) {
      console.error('Gallery error:', err);
      Alert.alert('Error', 'Gagal memilih gambar dari galeri.');
      setIsProcessing(false);
    }
  }, [isProcessing, processImage]);

  const handleShare = useCallback(async () => {
    let screenshotUri: string | undefined;
    let usedFallback = false;

    try {
      try {
        screenshotUri = await captureScreen({
          format: 'jpg',
          quality: 0.9,
          result: 'tmpfile',
        });
        console.log('Screenshot captured at:', screenshotUri);
      } catch (captureError: any) {
        console.error('Failed to capture screen:', captureError);

        // Fallback logic
        if (!capturedImageUri) {
          Alert.alert(
            'Error',
            'Gagal mengambil screenshot dan tidak ada gambar yang dapat dibagikan.',
          );
          return;
        }

        let imageUri = capturedImageUri;
        if (
          !imageUri.startsWith('file://') &&
          !imageUri.startsWith('content://')
        ) {
          imageUri = `file://${imageUri}`;
        }

        screenshotUri = imageUri;
        usedFallback = true;
        console.log('Using raw image as fallback:', screenshotUri);
      }

      if (!screenshotUri) return;

      let fileUri = screenshotUri;
      if (!fileUri.startsWith('file://') && !fileUri.startsWith('content://')) {
        fileUri = `file://${fileUri}`;
      }

      const shareMessage = `Hasil Deteksi Odometer\n\nTipe: ${odometerType}\nNilai: ${odometerValue}`;

      console.log('Sharing screenshot from:', fileUri);

      if (ShareLib) {
        const shareOptions: any = {
          title: 'Hasil Deteksi Odometer',
          message: shareMessage,
          url: fileUri,
          type: 'image/jpeg',
        };

        await ShareLib.open(shareOptions);
        console.log('Shared successfully with react-native-share');
      } else {
        const shareOptions: any = {
          url: fileUri,
          type: 'image/jpeg',
          title: 'Hasil Deteksi Odometer',
          message: shareMessage,
        };

        const result = await RNShare.share(shareOptions);
        if (result.action === RNShare.sharedAction) {
          console.log('Shared successfully with built-in Share');
        }
      }

      if (
        screenshotUri &&
        !usedFallback &&
        screenshotUri.includes(RNFS.CachesDirectoryPath)
      ) {
        const pathToDelete = removeFilePrefix(screenshotUri);
        RNFS.unlink(pathToDelete)
          .then(() => console.log('Temp screenshot file deleted'))
          .catch(err => console.log('Failed to cleanup screenshot:', err));
      }
    } catch (error: any) {
      console.error('Share error:', error);
      if (
        error.message?.includes('RNViewShot') ||
        error.message?.includes('captureScreen') ||
        error.message?.includes('TurboModuleRegistry')
      ) {
        Alert.alert(
          'Module Tidak Ditemukan',
          'Fitur screenshot belum tersedia. Silakan rebuild aplikasi:\n\n1. Stop aplikasi\n2. Jalankan: npm run android',
        );
      } else if (error.message !== 'User did not share') {
        Alert.alert('Error', error.message || 'Gagal membagikan screenshot.');
      }
    }
  }, [capturedImageUri, odometerType, odometerValue, removeFilePrefix]);

  // const requestPermissionManually = async () => {
  //   try {
  //     const status = await Camera.requestCameraPermission();
  //     console.log('Manual permission request:', status);
  //     const granted = status === 'granted';
  //     setHasPermission(granted);

  //     if (!granted) {
  //       Alert.alert(
  //         'Izin Ditolak',
  //         'Silakan berikan izin kamera di pengaturan aplikasi untuk melanjutkan.',
  //         [
  //           {text: 'Batal', style: 'cancel'},
  //           {
  //             text: 'Buka Pengaturan',
  //             onPress: () => Linking.openSettings(),
  //           },
  //         ],
  //       );
  //     }
  //   } catch (error) {
  //     console.error('Manual permission error:', error);
  //   }
  // };

  if (device == null || !hasPermission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007bff" />
        <Text style={styles.loadingText}>
          {device == null ? 'Loading Camera...' : 'Meminta izin kamera...'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {isResultMode && capturedImageUri ? (
        <Image
          source={{uri: capturedImageUri}}
          style={styles.camera}
          resizeMode="cover"
        />
      ) : (
        cameraActive && (
          <Camera
            key={cameraKey}
            ref={camera}
            style={styles.camera}
            device={device}
            isActive={cameraActive}
            photo={true}
          />
        )
      )}

      {!isResultMode && (
        <View style={styles.guideOverlay}>
          <View style={styles.guideBox}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <Text style={styles.guideLabel}>
            Sejajarkan odometer di dalam kotak
          </Text>
        </View>
      )}

      {isResultMode ? (
        <>
          <TouchableOpacity
            style={[styles.button, styles.buttonTryAgain]}
            onPress={resetToCamera}>
            <Text style={styles.buttonText}>Coba Lagi</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.buttonGallery, styles.buttonShare]}
            onPress={handleShare}>
            <Text style={styles.buttonText}>Bagikan</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <TouchableOpacity
            style={[styles.button, isProcessing && styles.buttonDisabled]}
            onPress={takePhoto}
            disabled={isProcessing}>
            <Text style={styles.buttonText}>
              {isProcessing ? 'Memproses...' : 'Ambil Foto'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.buttonGallery,
              isProcessing && styles.buttonDisabled,
            ]}
            onPress={selectImageFromGallery}
            disabled={isProcessing}>
            <Text style={styles.buttonText}>Pilih dari Galeri</Text>
          </TouchableOpacity>
        </>
      )}

      {loading && (
        <View style={styles.loadingOverlay}>
          <View style={{transform: [{scale: 2}]}}>
            <ActivityIndicator size="large" color="#ffffff" />
          </View>
          <Text style={styles.loadingText}>Sedang Memproses...</Text>
          <Text style={styles.loadingSubtext}>
            Menganalisis gambar odometer...
          </Text>
        </View>
      )}

      {(odometerType !== '' || odometerValue !== '') && (
        <View style={styles.resultContainer}>
          <Text style={styles.resultLabel}>Hasil Deteksi</Text>
          <View style={styles.resultDivider} />
          <Text style={styles.resultText}>
            Tipe: <Text style={styles.resultValue}>{odometerType}</Text>
          </Text>
          <Text style={[styles.resultText, styles.resultValueText]}>
            Nilai: <Text style={styles.resultValueLarge}>{odometerValue}</Text>
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  camera: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  button: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    backgroundColor: '#007bff',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 25,
    zIndex: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  buttonGallery: {
    position: 'absolute',
    bottom: 90,
    alignSelf: 'center',
    backgroundColor: '#5eccff',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 25,
    zIndex: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  buttonTryAgain: {
    backgroundColor: '#28a745',
  },
  buttonShare: {
    backgroundColor: '#17a2b8',
  },
  buttonDisabled: {
    backgroundColor: '#cccccc',
    opacity: 0.6,
  },
  loadingOverlay: {
    position: 'absolute',
    zIndex: 100,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 15,
  },
  loadingSubtext: {
    color: '#cccccc',
    fontSize: 14,
    marginTop: 8,
  },
  permissionText: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  resultContainer: {
    position: 'absolute',
    top: 50,
    backgroundColor: 'white',
    zIndex: 100,
    maxWidth: '90%',
    minWidth: '80%',
    alignSelf: 'center',
    padding: 20,
    borderRadius: 15,
    elevation: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
  },
  resultLabel: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  resultDivider: {
    width: '100%',
    height: 1,
    backgroundColor: '#e0e0e0',
    marginBottom: 12,
  },
  resultText: {
    color: '#333',
    fontSize: 16,
    textAlign: 'center',
    marginVertical: 4,
  },
  resultValue: {
    fontWeight: '600',
    color: '#007bff',
  },
  resultValueText: {
    marginTop: 8,
  },
  resultValueLarge: {
    fontWeight: 'bold',
    fontSize: 24,
    color: '#007bff',
  },
  resultMethodText: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  guideOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  guideBox: {
    width: '85%',
    height: 200,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 10,
    position: 'relative',
    marginBottom: 50,
  },
  guideLabel: {
    color: 'white',
    fontSize: 14,
    marginTop: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    overflow: 'hidden',
    marginBottom: 50,
  },
  corner: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: '#007bff',
    borderWidth: 3,
  },
  cornerTL: {
    top: -1,
    left: -1,
    borderBottomWidth: 0,
    borderRightWidth: 0,
    borderTopLeftRadius: 10,
  },
  cornerTR: {
    top: -1,
    right: -1,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderTopRightRadius: 10,
  },
  cornerBL: {
    bottom: -1,
    left: -1,
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomLeftRadius: 10,
  },
  cornerBR: {
    bottom: -1,
    right: -1,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderBottomRightRadius: 10,
  },
});

export default OdometerDetectionScreen;
