import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, Button,
  PermissionsAndroid, Platform, StyleSheet, ScrollView, Alert
} from 'react-native';
import RNBluetoothClassic, {
  BluetoothDevice, BluetoothEventSubscription
} from 'react-native-bluetooth-classic';

export default function App() {
  const [enabled, setEnabled] = useState(false);
  const [paired, setPaired] = useState<BluetoothDevice[]>([]);
  const [device, setDevice] = useState<BluetoothDevice | null>(null);
  const [connected, setConnected] = useState(false);
  const [input, setInput] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const readSub = useRef<BluetoothEventSubscription | null>(null);

  useEffect(() => {
    checkAndLoadPaired(); return () => {
      // Limpamos o listener de leitura quando existir (será criado mais tarde)
      readSub.current?.remove();
      readSub.current = null;
    };
  }, []);

  async function connectTo(d: BluetoothDevice) {
    try {
      if (device && connected) { try { await device.disconnect(); } catch { } }
      setDevice(d);

      const ok = await d.connect({
        connectorType: 'rfcomm',
        delimiter: '\n',
        deviceCharset: Platform.OS === 'ios' ? 1536 : 'utf-8',
      });
      setConnected(ok);
      if (!ok) throw new Error('Falha na conexão');

      attachReader(d); // próxima etapa
    } catch (e: any) {
      setConnected(false);
      Alert.alert('Erro', e?.message || 'Não foi possível conectar');
    }
  }
  async function disconnect() {
    try { if (device && connected) await device.disconnect(); } catch { }
    setConnected(false);
    setDevice(null);
    readSub.current?.remove();
    readSub.current = null;
    setLog((L) => [...L, 'Desconectado.']);
  }

  async function requestBtPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    try {
      if (Platform.Version >= 31) {
        const res = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        return Object.values(res).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
      } else {
        const r = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        return r === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch (e) {
      console.warn('Permissões BT falharam:', e);
      return false;
    }
  }

  function attachReader(d: BluetoothDevice) {
    readSub.current?.remove();
    readSub.current = d.onDataReceived((event) => {
      // cada "data" é uma linha até o delimitador \n
      setLog((L) => [...L, `RX: ${event.data}`]);
    });
    setLog((L) => [...L, 'Conectado.']);
  }

  async function sendLine() {
    if (!device || !connected) return;
    try {
      const line = input.endsWith('\n') ? input : input + '\n';
      await device.write(line, 'utf-8');
      setLog((L) => [...L, `TX: ${line.trimEnd()}`]);
      setInput('');
    } catch (e: any) {
      Alert.alert('Erro ao enviar', e?.message || String(e));
    }
  }

  async function checkAndLoadPaired() {
    const ok = await requestBtPermissions();
    if (!ok) { Alert.alert('Permissão', 'Bluetooth negado.'); return; }

    const isAvail = await RNBluetoothClassic.isBluetoothAvailable();
    const isEnabled = await RNBluetoothClassic.isBluetoothEnabled();
    setEnabled(isAvail && isEnabled);

    if (!isEnabled) {
      // Opcional: abrir configurações do BT
      // await RNBluetoothClassic.openBluetoothSettings();
    }

    try {
      const bonded = await RNBluetoothClassic.getBondedDevices();
      setPaired(bonded);
    } catch (e) {
      console.warn('Erro ao obter pareados', e);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>BT Clássico — SPP</Text>
      {!enabled && (<Text style={{ color: '#b00' }}>Ative o Bluetooth no Android.</Text>)}

      <Text style={{ fontWeight: '600' }}>Dispositivos pareados</Text>
      <FlatList
        data={paired}
        keyExtractor={(item) => item.address}
        horizontal
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={{ padding: 8, borderWidth: 1, borderColor: '#999', borderRadius: 12, marginRight: 8 }}
            onPress={() => {/* vamos conectar na próxima etapa */ }}
          >
            <Text>{item.name || item.address}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={{ color: '#666' }}>Nenhum pareado.</Text>}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput
          style={{ flex: 1, borderWidth: 1, borderColor: '#aaa', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8 }}
          placeholder="Digite e envie (\n no final)"
          value={input}
          onChangeText={setInput}
          editable={connected}
          autoCapitalize="none"
        />
        <Button title="Enviar" onPress={sendLine} disabled={!connected || !input} />
      </View>
      <View style={{ flexDirection:'row' }}>
  <Button title="Desconectar" onPress={disconnect} disabled={!connected} />
</View>

      <Text style={{ fontWeight: '600', marginTop: 8 }}>Log</Text>
      <ScrollView style={{ flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 8 }}>
        {log.map((l, i) => (<Text key={i} style={{ fontFamily: Platform.select({ android: 'monospace', ios: 'Menlo' }), fontSize: 12 }}>{l}</Text>))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 48, gap: 12 },
  title: { fontSize: 20, fontWeight: 'bold' },
  muted: { color: '#666' },
});