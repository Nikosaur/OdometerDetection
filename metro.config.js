const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);
defaultConfig.resolver.assetExts.push('tflite');
defaultConfig.resolver.assetExts.push('bin');

module.exports = mergeConfig(defaultConfig, {});