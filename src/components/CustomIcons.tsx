import React from 'react';
import { View, StyleSheet, Image } from 'react-native';

interface IconProps {
  size?: number;
  backgroundColor?: string;
}

// 1. 提交魚塘相片 - 相機 + 魚
export function FishPondSubmitIcon({ size = 80, backgroundColor = 'transparent' }: IconProps) {
  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2, backgroundColor }]}>
      <Image
        source={require('../../assets/Camera_01_Fishpond.png')}
        style={{ width: size * 0.9, height: size * 0.9 }}
        resizeMode="contain"
      />
    </View>
  );
}

// 2. 提交雀鳥相片 - 相機 + 雀鳥
export function BirdSubmitIcon({ size = 80, backgroundColor = 'transparent' }: IconProps) {
  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2, backgroundColor }]}>
      <Image
        source={require('../../assets/Camera_02_Bird.png')}
        style={{ width: size * 0.9, height: size * 0.9 }}
        resizeMode="contain"
      />
    </View>
  );
}

// 3. 魚塘相片庫 - 相框 + 魚
export function FishPondGalleryIcon({ size = 80, backgroundColor = 'transparent' }: IconProps) {
  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2, backgroundColor }]}>
      <Image
        source={require('../../assets/Album_01_Fishpond.png')}
        style={{ width: size * 0.9, height: size * 0.9 }}
        resizeMode="contain"
      />
    </View>
  );
}

// 4. 雀鳥相片庫 - 相框 + 雀鳥
export function BirdGalleryIcon({ size = 80, backgroundColor = 'transparent' }: IconProps) {
  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2, backgroundColor }]}>
      <Image
        source={require('../../assets/Album_02_Bird.png')}
        style={{ width: size * 0.9, height: size * 0.9 }}
        resizeMode="contain"
      />
    </View>
  );
}

// 5. 我的魚塘記錄 - 剪貼板 + 魚
export function FishPondRecordsIcon({ size = 80, backgroundColor = 'transparent' }: IconProps) {
  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2, backgroundColor }]}>
      <Image
        source={require('../../assets/Record_01_Fishpond.png')}
        style={{ width: size * 0.9, height: size * 0.9 }}
        resizeMode="contain"
      />
    </View>
  );
}

// 5b. 魚類記錄（簡稱）
export function FishLogIcon({ size = 80, backgroundColor = 'transparent' }: IconProps) {
  return <FishPondRecordsIcon size={size} backgroundColor={backgroundColor} />;
}

// 6. 我的雀鳥記錄 - 剪貼板 + 雀鳥
export function BirdRecordsIcon({ size = 80, backgroundColor = 'transparent' }: IconProps) {
  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2, backgroundColor }]}>
      <Image
        source={require('../../assets/Record_02_Bird.png')}
        style={{ width: size * 0.9, height: size * 0.9 }}
        resizeMode="contain"
      />
    </View>
  );
}

// 6b. 雀鳥記錄（簡稱）
export function BirdLogIcon({ size = 80, backgroundColor = 'transparent' }: IconProps) {
  return <BirdRecordsIcon size={size} backgroundColor={backgroundColor} />;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 16,
  },
});
