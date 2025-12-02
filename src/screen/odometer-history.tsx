import {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TouchableWithoutFeedback,
  Modal,
  TextInput,
  Alert,
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
  onEdit?: (id: string, newValue: string) => void;
}

const OdometerHistory = ({
  visible,
  onClose,
  history,
  onEdit,
}: OdometerHistoryProps) => {
  const [editingItem, setEditingItem] = useState<HistoryItem | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleEdit = (item: HistoryItem) => {
    setEditingItem(item);
    setEditValue(item.value);
  };

  const saveEdit = () => {
    if (editingItem && onEdit) {
      onEdit(editingItem.id, editValue);
      setEditingItem(null);
      setEditValue('');
    }
  };

  const cancelEdit = () => {
    setEditingItem(null);
    setEditValue('');
  };

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
                  {onEdit && (
                    <TouchableOpacity
                      style={styles.editButton}
                      onPress={() => handleEdit(item)}>
                      <Text style={styles.editButtonText}>Edit</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            />
          </View>
        </TouchableWithoutFeedback>
        {editingItem && (
          <Modal transparent={true} animationType="slide">
            <View style={styles.editModalOverlay}>
              <View style={styles.editModal}>
                <Text style={styles.editTitle}>Edit Value</Text>
                <TextInput
                  style={styles.editInput}
                  value={editValue}
                  onChangeText={setEditValue}
                  keyboardType="numeric"
                  placeholder="Enter new value"
                />
                <View style={styles.editButtons}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={cancelEdit}>
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveButton}
                    onPress={saveEdit}>
                    <Text style={styles.saveButtonText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}
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
  editButton: {
    marginTop: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: '#007bff',
    borderRadius: 5,
    alignSelf: 'flex-start',
  },
  editButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  editModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  editModal: {
    width: '80%',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  editTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  editInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 5,
    padding: 10,
    fontSize: 16,
    marginBottom: 20,
    color: '#333',
  },
  editButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  cancelButton: {
    flex: 1,
    marginRight: 10,
    paddingVertical: 10,
    backgroundColor: '#ccc',
    borderRadius: 5,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  saveButton: {
    flex: 1,
    marginLeft: 10,
    paddingVertical: 10,
    backgroundColor: '#007bff',
    borderRadius: 5,
    alignItems: 'center',
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default OdometerHistory;
