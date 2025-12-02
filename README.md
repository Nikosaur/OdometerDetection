# Odometer Detection App

A React Native application that uses machine learning to detect and read odometer values from vehicle images. This app leverages TensorFlow.js and native camera capabilities to provide accurate odometer readings for automotive purposes.

## Features

- **Camera Integration**: Capture images directly from the device camera
- **Image Picker**: Select images from the device's gallery
- **Machine Learning Detection**: Uses TensorFlow.js and a custom TFLite model for odometer digit recognition
- **History Tracking**: Store and view previous odometer readings
- **Offline Processing**: Process images locally without requiring internet connectivity

## Prerequisites

Before running this project, ensure you have the following installed:

- Node.js (>= 18)
- React Native development environment
- Android Studio (for Android development)
- Yarn or npm package manager

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/Nikosaur/OdometerDetection.git
   cd OdometerDetection
   ```

2. Install dependencies:

   ```bash
   npm install --legacy-peer-deps
   # or
   yarn install
   ```

## Running the App

### Start Metro Server

```bash
npm start
# or
yarn start
```

### Android

```bash
npm run android
# or
yarn android
```

## Project Structure

```
OdometerDetection/
├── android/                 # Android native code and configuration
│   ├── app/
│   │   ├── src/main/
│   │   │   ├── java/com/odometerdetection/  # Native modules
│   │   │   └── ml/                          # TFLite model
│   │   └── build.gradle
│   └── build.gradle
├── ios/                     # iOS native code and configuration
├── src/
│   ├── assets/              # Static assets
│   └── screen/              # React Native screens
│       ├── odometer-detection-screen.tsx
│       ├── odometer-detection-screen-2.tsx
│       └── odometer-history.tsx
├── App.tsx                  # Main app component
├── package.json             # Dependencies and scripts
└── README.md                # This file
```

## Key Technologies

- **React Native**: Cross-platform mobile development framework
- **TensorFlow.js**: Machine learning in JavaScript
- **React Native Vision Camera**: Advanced camera functionality
- **React Native TFLite**: Integration with TensorFlow Lite models
- **AsyncStorage**: Local data persistence
- **Firebase**: Backend services (if configured)

## Usage

1. Launch the app on your device or emulator
2. Grant camera permissions when prompted
3. Use the camera button to capture an odometer image or select from gallery
4. The app will process the image and display the detected odometer reading
5. View your reading history in the history screen

## Development

### Running Tests

```bash
npm test
# or
yarn test
```

### Linting

```bash
npm run lint
# or
yarn lint
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Troubleshooting

- Ensure all prerequisites are installed and configured correctly
- Check that Metro server is running before starting the app
- For Android: Ensure Android SDK and emulator are properly set up
- Clear Metro cache: `npx react-native start --reset-cache`

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- TensorFlow team for providing powerful ML tools
- React Native community for the excellent framework
- All contributors and open-source libraries used in this project
