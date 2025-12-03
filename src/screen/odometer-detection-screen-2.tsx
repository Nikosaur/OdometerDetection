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
} from 'react-native';
import {Camera, useCameraDevice} from 'react-native-vision-camera';
import {launchImageLibrary} from 'react-native-image-picker';
import OdometerHistory from './odometer-history';

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

interface HistoryItem {
  id: string;
  type: string;
  value: string;
  date: string;
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
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyData, setHistoryData] = useState<HistoryItem[]>([]);

  const removeFilePrefix = (filePath: string) => {
    return filePath.replace(/^file:\/\//, '');
  };

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

  const handleDetectionResult = useCallback(
    (imageData: DetectionResult | null) => {
      console.log('Image data:', imageData);
      setLoading(false);
      setIsProcessing(false);

      if (!imageData) {
        Alert.alert('Error', 'Tidak ada data yang dikembalikan dari model.', [
          {text: 'OK', onPress: resetDetection},
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
              onPress: resetDetection,
              style: 'destructive',
            },
          ],
        );
        return;
      }

      if (detectedValue) {
        setHistoryData(prev => [
          ...prev,
          {
            id: Date.now().toString(),
            type: detectedType,
            value: detectedValue,
            date: new Date().toLocaleString(),
          },
        ]);
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
              onPress: resetDetection,
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
              onPress: resetDetection,
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
              onPress: resetDetection,
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
              onPress: resetDetection,
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
              onPress: resetDetection,
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
    [resetDetection],
  );

  const processImage = useCallback(
    async (imagePath: string) => {
      const {ImageHelpers} = NativeModules as {
        ImageHelpers: ImageHelpersModule;
      };

      setLoading(true);
      setIsProcessing(true);
      resetDetection();

      setTimeout(() => {
        ImageHelpers.detectOdometer(imagePath)
          .then((imageData: DetectionResult) =>
            handleDetectionResult(imageData),
          )
          .catch((err: any) => {
            console.error('Detection error:', err);
            setLoading(false);
            setIsProcessing(false);

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
              {text: 'OK', onPress: resetDetection},
            ]);
          });
      }, 500);
    },
    [handleDetectionResult, resetDetection],
  );

  const takePhoto = useCallback(async () => {
    if (isProcessing || !device || !camera.current) {
      console.log('Cannot take photo: processing or no device');
      return;
    }

    try {
      const photo = await camera.current.takePhoto();
      if (photo?.path) {
        await processImage(photo.path);
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
          await processImage(removeFilePrefix(selectedImage.uri));
        }
      }
    } catch (err) {
      console.error('Gallery error:', err);
      Alert.alert('Error', 'Gagal memilih gambar dari galeri.');
      setIsProcessing(false);
    }
  }, [isProcessing, processImage]);

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
      {cameraActive && (
        <Camera
          key={cameraKey}
          ref={camera}
          style={styles.camera}
          device={device}
          isActive={cameraActive}
          photo={true}
        />
      )}

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

      <TouchableOpacity
        style={[
          styles.buttonHistory,
          isProcessing && styles.buttonDisabled,
          {bottom: 150},
        ]}
        onPress={() => setHistoryVisible(true)}>
        <Text style={styles.buttonText}>History</Text>
      </TouchableOpacity>

      <OdometerHistory
        visible={historyVisible}
        onClose={() => setHistoryVisible(false)}
        history={historyData}
        onEdit={(id: string, newValue: string) => {
          setHistoryData(prev =>
            prev.map(item =>
              item.id === id ? {...item, value: newValue} : item,
            ),
          );
        }}
      />

      <TouchableOpacity
        style={[styles.button, isProcessing && styles.buttonDisabled]}
        onPress={takePhoto}
        disabled={isProcessing}>
        <Text style={styles.buttonText}>
          {isProcessing ? 'Memproses...' : 'Ambil Foto'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.buttonGallery, isProcessing && styles.buttonDisabled]}
        onPress={selectImageFromGallery}
        disabled={isProcessing}>
        <Text style={styles.buttonText}>Pilih dari Galeri</Text>
      </TouchableOpacity>

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
  buttonHistory: {
    position: 'absolute',
    bottom: 150,
    alignSelf: 'center',
    backgroundColor: '#28a745',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    zIndex: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.3,
    shadowRadius: 3,
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
