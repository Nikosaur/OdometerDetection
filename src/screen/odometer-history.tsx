import {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TouchableWithoutFeedback,
} from 'react-native';

interface HistoryItem {
  id: string;
  type: string;
  value: string;
  date: string;
}

interface OdometerHistoryProps {
  visible: boolean;
  onClose: () => void;
  history: HistoryItem[];
}

const OdometerHistory = ({visible, onClose, history}: OdometerHistoryProps) => {
  if (!visible) return null;

  return (
    <TouchableWithoutFeedback onPress={onClose}>
      <View style={styles.overlay}>
        <TouchableWithoutFeedback>
          <View style={styles.modal}>
            <Text style={styles.title}>Riwayat Prediksi</Text>
            <FlatList
              data={history.slice(-5).reverse()}
              keyExtractor={item => item.id}
              renderItem={({item}) => (
                <View style={styles.item}>
                  <Text style={styles.itemText}>Type: {item.type}</Text>
                  <Text style={styles.itemText}>Value: {item.value}</Text>
                  <Text style={styles.itemDate}>{item.date}</Text>
                </View>
              )}
            />
          </View>
        </TouchableWithoutFeedback>
      </View>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  modal: {
    width: '85%',
    maxHeight: '80%',
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
    color: '#333',
  },
  item: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  itemText: {
    fontSize: 16,
    color: '#333',
  },
  itemDate: {
    fontSize: 12,
    color: '#888',
  },
});

export default OdometerHistory;
