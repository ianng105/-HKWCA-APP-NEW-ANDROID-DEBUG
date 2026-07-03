import React, { useState, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, StatusBar, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

type LocalPhoto = {
  id: string;
  uri: string;
  location: { latitude: number; longitude: number } | null;
};

type Props = {
  onCapture: (uri: string) => void;
  onComplete: () => void;
  onCancel: () => void;
  onDelete?: (photoId: string) => void;
  photos: LocalPhoto[];
  maxPhotos: number;
  enablePreview?: boolean;  // 是否啟用拍照後預覽
}

export function CustomCamera({ onCapture, onComplete, onCancel, onDelete, photos, maxPhotos, enablePreview = true }: Props) {
  const [facing, setFacing] = useState<CameraType>('back');
  const [isCapturing, setIsCapturing] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [zoom, setZoom] = useState(0);
  const zoomRangeRef = useRef({ min: 0, max: 1 });

  const ZOOM_PRESETS = [0.5, 1, 2, 4, 6, 8];

  const zoomTargetForPreset = (preset: number) => {
    const { min, max } = zoomRangeRef.current;
    // 0.5x → 0, 1x → 0.067, 2x → 0.2, 4x → 0.467, 6x → 0.733, 8x → 1.0
    const t = preset <= 1 ? (preset - 0.5) / 7.5 : (preset - 1) / 7;
    return t * (max - min);
  };

  const canAddMore = photos.length < maxPhotos;
  // 啟用預覽模式（拍照後顯示確定/重拍按鈕）
  const isSinglePhotoMode = enablePreview;

  const handleZoomIn = () => {
    setZoom((prev) => {
      const { max } = zoomRangeRef.current;
      return Math.min(prev + 0.1, max);
    });
  };

  const handleZoomOut = () => {
    setZoom((prev) => {
      const { min } = zoomRangeRef.current;
      return Math.max(prev - 0.1, min);
    });
  };

  const handleZoomPreset = (preset: number) => {
    const target = zoomTargetForPreset(preset);
    const { min, max } = zoomRangeRef.current;
    setZoom(Math.min(Math.max(target, min), max));
  };

  if (!permission) {
    return <View />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText}>需要相機權限才能拍照</Text>
          <Pressable style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>授予權限</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const takePicture = async () => {
    if (cameraRef.current && canAddMore && !isCapturing) {
      try {
        setIsCapturing(true);
        
        const photo = await cameraRef.current.takePictureAsync({
          imageType: 'jpg',
          quality: 1.0,
          exif: true,
        });
        
        if (photo?.uri) {
          if (isSinglePhotoMode) {
            // 預覽模式：顯示確定/重拍按鈕
            setPreviewUri(photo.uri);
          } else {
            // 多張模式：直接添加
            onCapture(photo.uri);
          }
        }
      } catch (error) {
        console.error('拍照錯誤:', error);
      } finally {
        setIsCapturing(false);
      }
    }
  };

  const handleConfirm = () => {
    if (previewUri) {
      onCapture(previewUri);
      setPreviewUri(null);
      onComplete();
    }
  };

  const handleRetake = () => {
    setPreviewUri(null);
  };

  const handleCancel = () => {
    setPreviewUri(null);
    onCancel();
  };

  // 單張模式：顯示預覽界面
  if (isSinglePhotoMode && previewUri) {
    // 預覽模式：顯示確定/重拍按鈕
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />
        
        {/* 預覽圖片 */}
        <Image source={{ uri: previewUri }} style={styles.previewImage} />
        
        {/* 底部按鈕區域 */}
        <View style={styles.actionBar}>
          {/* 取消按鈕 */}
          <Pressable style={styles.actionButtonCancel} onPress={handleCancel}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>取消</Text>
          </Pressable>

          {/* 重拍按鈕 */}
          <Pressable style={styles.actionButtonLeft} onPress={handleRetake}>
            <Ionicons name="refresh" size={32} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>重新拍</Text>
          </Pressable>

          {/* 確定按鈕 */}
          <Pressable style={styles.actionButtonRight} onPress={handleConfirm}>
            <Ionicons name="checkmark" size={36} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>確定</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  
  console.log('[CustomCamera] ⏭️ 跳過預覽界面，進入拍攝模式');

  // 拍攝模式
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        zoom={zoom}
        onCameraReady={() => {}}
      >
        {/* 頂部控制欄 */}
        <View style={styles.topBar}>
          <Pressable style={styles.topButton} onPress={onCancel}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </Pressable>
        </View>

        {/* 正在載入照片提示 */}
        {isCapturing && (
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingContainer}>
              <Ionicons name="hourglass" size={48} color="#FFFFFF" />
              <ActivityIndicator size="large" color="#FFFFFF" style={styles.loadingSpinner} />
              <Text style={styles.loadingText}>正在載入照片...</Text>
            </View>
          </View>
        )}

        {/* 底部控制欄 */}
        <SafeAreaView style={styles.bottomBar}>
          <View style={styles.bottomControls}>
            {/* 左邊：縮放控制 */}
            <View style={styles.zoomControls}>
              {ZOOM_PRESETS.map((preset) => (
                <Pressable
                  key={preset}
                  style={[
                    styles.zoomPresetButton,
                    Math.abs(zoom - zoomTargetForPreset(preset)) < 0.05 && styles.zoomPresetButtonActive,
                  ]}
                  onPress={() => handleZoomPreset(preset)}
                >
                  <Text style={[
                    styles.zoomPresetText,
                    Math.abs(zoom - zoomTargetForPreset(preset)) < 0.05 && styles.zoomPresetTextActive,
                  ]}>
                    {preset}x
                  </Text>
                </Pressable>
              ))}
              <View style={{ width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: 4 }} />
              <Pressable style={styles.zoomButton} onPress={handleZoomOut}>
                <Ionicons name="remove" size={20} color="#FFFFFF" />
              </Pressable>
              <Pressable style={styles.zoomButton} onPress={handleZoomIn}>
                <Ionicons name="add" size={20} color="#FFFFFF" />
              </Pressable>
            </View>

            {/* 中間：拍照按鈕 */}
            <Pressable
              style={[styles.captureButton, (!canAddMore || isCapturing) && styles.captureButtonDisabled]}
              onPress={takePicture}
              disabled={!canAddMore || isCapturing}
            >
              <View style={styles.captureButtonInner} />
            </Pressable>

            {/* 右邊：切換鏡頭 */}
            <Pressable style={styles.sideButton} onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}>
              <Ionicons name="camera-reverse" size={28} color="#FFFFFF" />
            </Pressable>
          </View>

          {/* 提示文字 */}
          <Text style={styles.hintText}>
            {isSinglePhotoMode ? '請拍攝一張相片' : `${photos.length}/${maxPhotos} 張相片`}
          </Text>
        </SafeAreaView>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  camera: {
    flex: 1,
  },
  
  // 權限請求
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  permissionText: {
    fontSize: 16,
    color: '#111827',
    textAlign: 'center',
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: '#059669',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // 拍攝模式 - 頂部控制欄
  topBar: {
    position: 'absolute',
    top: 44,
    left: 0,
    right: 0,
    height: 60,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
    zIndex: 100,
  },
  topButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // 拍攝模式 - 底部控制欄
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  bottomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
    paddingVertical: 20,
  },
  sideButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    paddingHorizontal: 6,
    paddingVertical: 4,
    justifyContent: 'center',
    gap: 4,
  },
  zoomPresetButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 28,
  },
  zoomPresetButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  zoomPresetText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  zoomPresetTextActive: {
    color: '#000000',
  },
  zoomButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  galleryButton: {
    width: 50,
    height: 50,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    position: 'relative',
  },
  galleryImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  galleryBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: 'rgba(0, 153, 153, 0.9)',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  galleryBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  completeButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 153, 153, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  completeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  captureButtonInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FFFFFF',
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  maxPhotosIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(74, 124, 140, 0.8)',
    borderRadius: 40,
  },
  photoCountText: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 6,
    marginBottom: 4,
  },

  // 正在載入照片的覆蓋層
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  loadingContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    gap: 16,
  },
  loadingSpinner: {
    marginTop: -8,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },

  // 已拍攝照片縮略圖（拍攝模式）
  thumbnailContainerShoot: {
    position: 'absolute',
    bottom: 130,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  thumbnailScroll: {
    flexDirection: 'row',
    gap: 10,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  thumbnailItemSmall: {
    width: 48,
    height: 48,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    position: 'relative',
  },
  thumbnailBadgeSmall: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(74, 124, 140, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailDeleteBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  thumbnailBadgeTextSmall: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // 預覽模式樣式
  previewImage: {
    flex: 1,
    resizeMode: 'contain',
    backgroundColor: '#000000',
  },
  previewTopBar: {
    position: 'absolute',
    top: 44,  // iOS 狀態欄高度約 44
    left: 0,
    right: 0,
    height: 60,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
    zIndex: 100,
  },
  actionBar: {
    position: 'absolute',
    bottom: 60,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 999,
  },
  actionButtonCancel: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 25,
    gap: 4,
  },
  actionButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    gap: 8,
  },
  actionButtonRight: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    gap: 8,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  hintText: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 8,
    marginBottom: 12,
  },
});
