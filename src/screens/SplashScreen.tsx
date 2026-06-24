import React, { useEffect, useState } from 'react';
import { View, Image, StyleSheet, Dimensions, StatusBar } from 'react-native';
import * as Location from 'expo-location';

const { width, height } = Dimensions.get('window');

type Props = {
  onFinish: () => void;
};

export function SplashScreen({ onFinish }: Props) {
  const [gpsInitialized, setGpsInitialized] = useState(false);

  // 导航栏颜色已在 app.json 中配置，无需在代码中动态设置

  useEffect(() => {
    // 启动GPS
    const initGPS = async () => {
      try {
        console.log('啟動畫面: 開始初始化GPS...');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          console.log('啟動畫面: GPS權限已授予');
          // 獲取一次位置以確保GPS已啟動
          const location = await Location.getCurrentPositionAsync({ 
            accuracy: Location.Accuracy.Balanced 
          });
          console.log('啟動畫面: GPS已啟動，位置:', location.coords.latitude, location.coords.longitude);
        } else {
          console.log('啟動畫面: GPS權限未授予');
        }
      } catch (error) {
        console.log('啟動畫面: GPS初始化錯誤:', error);
      } finally {
        setGpsInitialized(true);
      }
    };

    void initGPS();
  }, []);

  useEffect(() => {
    // 3秒後結束啟動畫面
    const timer = setTimeout(() => {
      console.log('啟動畫面: 3秒已過，準備進入應用');
      onFinish();
    }, 3000);

    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <View style={styles.container}>
      <StatusBar 
        barStyle="light-content" 
        backgroundColor="#59B8CE" 
        translucent={false}
      />
      <Image
        source={require('../../assets/splash-icon2.png')}
        style={styles.image}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    backgroundColor: '#59B8CE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: width,
    height: height,
    resizeMode: 'cover',
  },
});
