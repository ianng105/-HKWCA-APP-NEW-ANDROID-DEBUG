import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Animated, Platform, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetwork } from '../contexts/NetworkContext';

export function NetworkIndicator() {
  const { isConnected } = useNetwork();
  const insets = useSafeAreaInsets();
  const topOffset = (insets.top > 0 ? insets.top : (Platform.OS === 'android' ? StatusBar.currentHeight || 44 : 44)) + 110;
  const [showModal, setShowModal] = useState(false);
  const [hasShownModal, setHasShownModal] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    if (!isConnected) {
      // 显示顶部提示条（淡入动画）
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      // 如果还没显示过对话框，则显示
      if (!hasShownModal) {
        setShowModal(true);
        setHasShownModal(true);
      }
    } else {
      // 隐藏顶部提示条（淡出动画）
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
      
      // 重置对话框状态（下次断网时再次显示）
      setHasShownModal(false);
    }
  }, [isConnected]);

  // 如果在线，不显示任何内容
  if (isConnected) {
    return null;
  }

  return (
    <>
      {/* 顶部持续显示的提示条 */}
      <Animated.View style={[styles.banner, { opacity: fadeAnim, top: topOffset }]}>
        <Ionicons name="cloud-offline" size={18} color="#FFFFFF" />
        <Text style={styles.bannerText}>未能連接到網絡，請檢查您的網絡連接</Text>
      </Animated.View>

      {/* 可关闭的对话框 */}
      <Modal
        visible={showModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* 关闭按钮 */}
            <Pressable 
              style={styles.closeButton}
              onPress={() => setShowModal(false)}
            >
              <Ionicons name="close" size={24} color="#6B7280" />
            </Pressable>

            {/* 图标 */}
            <View style={styles.iconContainer}>
              <Ionicons name="cloud-offline-outline" size={64} color="#EF4444" />
            </View>

            {/* 标题 */}
            <Text style={styles.modalTitle}>網絡連接已中斷</Text>

            {/* 说明文字 */}
            <Text style={styles.modalDescription}>
              你現時已離線{'\n'}
              請連線至網絡以提交相片或查看紀錄
            </Text>

            {/* 提示信息 */}
            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={20} color="#059669" />
              <Text style={styles.infoText}>
                離線時不會自動登出
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#EF4444',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
    zIndex: 9999,
    elevation: 10,
  },
  bannerText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  iconContainer: {
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalDescription: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
    width: '100%',
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#059669',
    fontWeight: '600',
  },
});
