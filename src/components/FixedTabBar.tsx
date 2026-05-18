import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';

export function FixedTabBar() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const tabs = [
    { name: 'Home', label: '主頁', icon: 'home', iconOutline: 'home-outline' },
    { name: 'Gallery', label: '相簿', icon: 'images', iconOutline: 'images-outline' },
    { name: 'Submit', label: '提交', icon: 'camera', iconOutline: 'camera-outline' },
    { name: 'Records', label: '我的記錄', icon: 'document-text', iconOutline: 'document-text-outline' },
    { name: 'More', label: '更多', icon: 'menu', iconOutline: 'menu-outline' },
  ];

  const handleTabPress = (tabName: string) => {
    navigation.navigate('Main', { screen: tabName } as any);
  };

  // 判斷當前頁面是否屬於某個 tab
  const isActive = (tabName: string) => {
    if (route.name === 'Main') return false; // 在 Main 中已經有 tab bar 了
    
    // 根據當前頁面判斷應該高亮哪個 tab
    switch (route.name) {
      case 'FishSubmit':
      case 'BirdSubmit':
        return tabName === 'Submit';
      case 'FishRecords':
      case 'BirdRecords':
        return tabName === 'Records';
      case 'FishGallery':
      case 'BirdGallery':
        return tabName === 'Gallery';
      case 'SubmissionDetail':
        return tabName === 'Records';
      default:
        return false;
    }
  };

  return (
    <View style={[styles.tabBar, { paddingBottom: insets.bottom + 5 }]}>
      {tabs.map((tab) => {
        const active = isActive(tab.name);
        const color = active ? '#009999' : '#9CA3AF'; // Active: 綠色，Inactive: 灰色
        const iconName = active ? tab.icon : tab.iconOutline; // Active: 實心，Inactive: 空心

        return (
          <Pressable
            key={tab.name}
            style={styles.tabBarItem}
            onPress={() => handleTabPress(tab.name)}
          >
            <Ionicons name={iconName as any} size={22} color={color} />
            <Text style={[styles.tabBarLabel, { color }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // 完全複製 tabBarStyle
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 10,
    flexDirection: 'row',
  },
  // tabBarItemStyle（微調以匹配首頁間距）
  tabBarItem: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 5,
  },
  // 完全複製 tabBarLabelStyle
  tabBarLabel: {
    fontWeight: '800',
    fontSize: 12,
    marginTop: 2,
  },
});
