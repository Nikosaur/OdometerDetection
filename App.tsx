/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React from 'react';
import {SafeAreaView, StyleSheet} from 'react-native';

import OdometerDetectionScreen from './src/screen/odometer-detection-screen';

function App(): React.JSX.Element {
  return (
    <SafeAreaView style={styles.container}>
      <OdometerDetectionScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default App;
