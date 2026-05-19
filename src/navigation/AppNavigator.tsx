import React, { useEffect } from 'react';
import { ActivityIndicator, View, Pressable, Image, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

import { useAuth } from '../contexts/AuthContext';
import { SplashScreen } from '../screens/SplashScreen';
import { GallerySelectionScreen } from '../screens/GallerySelectionScreen';
import { FishGalleryScreen } from '../screens/FishGalleryScreen';
import { BirdGalleryScreen } from '../screens/BirdGalleryScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { MapPickerScreen } from '../screens/MapPickerScreen';
import { MoreScreen } from '../screens/MoreScreen';
import { RecordsSummaryScreen } from '../screens/RecordsSummaryScreen';
import { FishRecordsScreen } from '../screens/FishRecordsScreen';
import { BirdRecordsScreen } from '../screens/BirdRecordsScreen';
import { SubmissionDetailScreen } from '../screens/SubmissionDetailScreen';
import { SubmitScreen } from '../screens/SubmitScreen';
import { FishSubmitScreen } from '../screens/FishSubmitScreen';
import { BirdSubmitScreen } from '../screens/BirdSubmitScreen';
import { SubmissionSuccessScreen } from '../screens/SubmissionSuccessScreen';
import { WelcomeScreen } from '../screens/WelcomeScreen';

export type PickedLocation = {
  latitude: number;
  longitude: number;
};

export type AppMode = 'fish' | 'bird';

export type MainTabParamList = {
  Home: { pickedLocation?: PickedLocation } | undefined;
  Gallery: undefined;
  Submit: undefined;
  Records: undefined;
  More: undefined;
};

export type RootStackParamList = {
  Welcome: undefined;
  Auth: undefined;
  Main: NavigatorScreenParams<MainTabParamList>;
  FishSubmit:
    | {
        type?: AppMode;
        pondId?: string;
        pondName?: string;
        period?: string;
        pickedLocation?: PickedLocation;
      }
    | undefined;
  BirdSubmit:
    | {
        type?: AppMode;
        pondId?: string;
        pondName?: string;
        period?: string;
        pickedLocation?: PickedLocation;
      }
    | undefined;
  FishRecords: undefined;
  BirdRecords: undefined;
  FishGallery: { pondId?: string; periodId?: string } | undefined;
  BirdGallery: { pondId?: string; periodId?: string } | undefined;
  MapPicker: { initial?: PickedLocation; returnTo: keyof MainTabParamList | 'BirdSubmit' | 'FishSubmit' };
  SubmissionDetail: { id?: string; batchId?: string; category?: '魚塘相片' | '雀鳥相片' };
  SubmissionSuccess: { photoCount: number };
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function LoadingSplash() {
  return (
    <View style={splashStyles.container}>
      <Image
        source={require('../../assets/App loading page_3 second.jpg')}
        style={splashStyles.logo}
        resizeMode="contain"
      />
    </View>
  );
}

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#59B8CE',
  },
  logo: {
    width: '80%',
    height: '80%',
    maxWidth: 400,
    maxHeight: 600,
  },
});

function MainTabs() {
  const insets = useSafeAreaInsets();
  const { isApproved } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const requireLogin = (e: any) => {
    if (!isApproved) {
      e.preventDefault();
      Alert.alert('請先登入', '請先登入以使用本APP', [
        { text: '取消', style: 'cancel' },
        { text: '登入', onPress: () => navigation.navigate('Auth') },
      ]);
    }
  };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: 'rgba(0, 153, 153, 1)',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarLabelStyle: { fontWeight: '800', fontSize: 12 },
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E5E7EB',
          height: 60 + insets.bottom, // 动态计算高度：基础高度 + 底部安全区域
          paddingTop: 10,
          paddingBottom: Math.max(insets.bottom, 10), // 使用底部安全区域或最小10px
        },
        tabBarItemStyle: {
          paddingTop: 0,
          marginTop: 0,
        },
        tabBarIcon: ({ color, size, focused }) => {
          const name = (() => {
            switch (route.name) {
              case 'Home':
                return focused ? 'home' : 'home-outline';
              case 'Gallery':
                return focused ? 'images' : 'images-outline';
              case 'Submit':
                return focused ? 'camera' : 'camera-outline';
              case 'Records':
                return focused ? 'document-text' : 'document-text-outline';
              case 'More':
                return focused ? 'menu' : 'menu-outline';
              default:
                return focused ? 'ellipse' : 'ellipse-outline';
            }
          })();

          return <Ionicons name={name as any} size={size ?? 22} color={color} />;
        },
      })}
    >
      <Tab.Screen 
        name="Home" 
        component={HomeScreen} 
        options={{ 
          title: '主頁'
        }} 
      />
      <Tab.Screen name="Gallery" component={GallerySelectionScreen} options={{ title: '相片庫' }} listeners={{ tabPress: requireLogin }} />
      <Tab.Screen name="Submit" component={SubmitScreen} options={{ title: '提交' }} listeners={{ tabPress: requireLogin }} />
      <Tab.Screen name="Records" component={RecordsSummaryScreen} options={{ title: '我的記錄' }} listeners={{ tabPress: requireLogin }} />
      <Tab.Screen name="More" component={MoreScreen} options={{ title: '更多' }} />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const [showSplash, setShowSplash] = React.useState(true);

  const handleSplashFinish = React.useCallback(() => {
    setShowSplash(false);
  }, []);

  // 如果顯示啟動畫面，則顯示全屏啟動畫面
  if (showSplash) {
    return <SplashScreen onFinish={handleSplashFinish} />;
  }

  // Splash 後顯示歡迎頁面
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Welcome">
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen name="Auth" component={LoginScreen} />
      <Stack.Screen name="FishSubmit" component={FishSubmitScreen} />
      <Stack.Screen name="BirdSubmit" component={BirdSubmitScreen} />
      <Stack.Screen name="FishRecords" component={FishRecordsScreen} />
      <Stack.Screen name="BirdRecords" component={BirdRecordsScreen} />
      <Stack.Screen name="FishGallery" component={FishGalleryScreen} />
      <Stack.Screen name="BirdGallery" component={BirdGalleryScreen} />
      <Stack.Screen name="MapPicker" component={MapPickerScreen} options={{ headerShown: true, title: '選擇位置' }} />
      <Stack.Screen name="SubmissionDetail" component={SubmissionDetailScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SubmissionSuccess" component={SubmissionSuccessScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
