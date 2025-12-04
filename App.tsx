/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, {useEffect} from 'react';
import {SafeAreaView, StyleSheet} from 'react-native';
import RNFS from 'react-native-fs'; // Import RNFS

import OdometerDetectionScreen from './src/screen/odometer-detection-screen';

// Defined outside component to keep it clean
const clearCacheOnStartup = async () => {
  try {
    const cacheDir = RNFS.CachesDirectoryPath;
    console.log('Starting cache cleanup at:', cacheDir);

    // 1. Clean Camera Folder (Vision Camera specific)
    // Note: The folder name might change depending on library version,
    // but checking for 'mrousavy' is usually safe.
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

    // 2. Clean Root Cache & Image Picker Folders
    const files = await RNFS.readDir(cacheDir);

    for (const file of files) {
      // A. Delete loose temp files (jpg/png/tmp) in the root cache folder
      if (
        file.isFile() &&
        (file.name.endsWith('.jpg') ||
          file.name.endsWith('.png') ||
          file.name.endsWith('.tmp') ||
          file.name.endsWith('.jpeg'))
      ) {
        await RNFS.unlink(file.path).catch(() => {});
      }

      // B. Target Image Picker specific temp folders (recursively delete)
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

function App(): React.JSX.Element {
  // Run cleanup once when App mounts
  useEffect(() => {
    clearCacheOnStartup();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <OdometerDetectionScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black', // Added background color to match your screen
  },
});

export default App;
