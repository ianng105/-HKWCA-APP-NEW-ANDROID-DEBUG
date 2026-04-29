import React from 'react';
import { Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainTabParamList, RootStackParamList } from '../navigation/AppNavigator';
import { FishPondSubmitIcon, BirdSubmitIcon } from '../components/CustomIcons';

type Props = BottomTabScreenProps<MainTabParamList, 'Submit'>;

export function SubmitScreen({ route }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const statusBarHeight = Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={[styles.header, { paddingTop: statusBarHeight + 16 }]}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>提交</Text>
        </View>
      </View>

      <View style={styles.content}>
        <Text style={styles.subtitle}>請選擇要提交的相片類別</Text>

        <View style={styles.iconsContainer}>
          <Pressable
            style={styles.iconButton}
            onPress={() => {
              navigation.navigate('FishSubmit', { type: 'fish' });
            }}
          >
            <FishPondSubmitIcon size={176} />
            <Text style={styles.iconLabel}>魚塘相片</Text>
          </Pressable>

          <Pressable
            style={styles.iconButton}
            onPress={() => {
              navigation.navigate('BirdSubmit', { type: 'bird' });
            }}
          >
            <BirdSubmitIcon size={176} />
            <Text style={styles.iconLabel}>雀鳥相片</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'rgba(0, 153, 153, 1)' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0, 153, 153, 1)',
    position: 'relative',
    minHeight: 24,
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 24,
  },

  content: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#065F46',
    textAlign: 'center',
    marginBottom: 48,
    position: 'absolute',
    top: 25,
    width: '100%',
  },
  iconsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 48,
    marginTop: -50,
  },
  iconButton: {
    alignItems: 'center',
    gap: 3,
    borderWidth: 2,
    borderColor: '#DC2626',
    borderRadius: 16,
    padding: 12,
  },
  iconLabel: {
    fontSize: 18,
    fontWeight: '900',
    color: '#DC2626',
    marginTop: 3,
  },
});
