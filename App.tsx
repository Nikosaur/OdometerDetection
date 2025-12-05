/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, {useEffect} from 'react';
import {SafeAreaView, StyleSheet} from 'react-native';
import RNFS from 'react-native-fs';
import OdometerDetectionScreen from './src/screen/odometer-detection-screen';

// Pembersihan cache saat startup
const clearCacheOnStartup = async () => {
  try {
    const cacheDir = RNFS.CachesDirectoryPath;
    console.log('Starting cache cleanup at:', cacheDir);

    const cameraFolder = `${cacheDir}/mrousavy-vision-camera`;
    const cameraFolderExists = await RNFS.exists(cameraFolder);

    if (cameraFolderExists) {
      const files = await RNFS.readDir(cameraFolder);
      for (const file of files) {
        await RNFS.unlink(file.path).catch(err =>
          console.log('Skip file', err),
        );
      }
      console.log('Vision Camera folder cleared');
    }

    const files = await RNFS.readDir(cacheDir);

    for (const file of files) {
      if (
        file.isFile() &&
        (file.name.endsWith('.jpg') ||
          file.name.endsWith('.png') ||
          file.name.endsWith('.tmp') ||
          file.name.endsWith('.jpeg'))
      ) {
        await RNFS.unlink(file.path).catch(() => {});
      }

      if (
        file.isDirectory() &&
        (file.name.includes('rn_image_picker') ||
          file.name.includes('react-native-image-crop-picker'))
      ) {
        await RNFS.unlink(file.path).catch(() => {});
      }
    }
    console.log('Startup cache cleared successfully');
  } catch (e) {
    console.warn('Failed to clear startup cache', e);
  }
};

// Komponen utama aplikasi
function App(): React.JSX.Element {
  useEffect(() => {
    clearCacheOnStartup();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <OdometerDetectionScreen />
    </SafeAreaView>
  );
}

// StyleSheet utama
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
});

export default App;
