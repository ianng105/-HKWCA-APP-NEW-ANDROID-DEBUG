import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  InteractionManager,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import { checkPhotoGPS, quickCheckGPS, getGPSCheckErrorMessage, type GPSCheckResult } from '../utils/exifGpsParser';
import { extractGPSWithFallback, GPSExtractionResult } from '../lib/exifToolsApi';


import { useAuth } from '../contexts/AuthContext';
import { functionsFetch, restFetch, getSignedUploadUrl, uploadFileToStorage } from '../lib/api';
import type { AppMode, PickedLocation, RootStackParamList } from '../navigation/AppNavigator';
import { FishPondSubmitIcon, BirdSubmitIcon } from '../components/CustomIcons';
import { CustomCamera } from '../components/CustomCamera';
import { handleAuthError } from '../lib/autoReSignIn';
import { FixedTabBar } from '../components/FixedTabBar';

// 雀鳥相片要求示例圖片（新版）
const birdRequirement01 = require('../../assets/Bird_01_compressed.jpg');
const birdRequirement02 = require('../../assets/Bird_02_compressed.jpg');
const birdRequirement03 = require('../../assets/Bird_03_compressed.jpg');
const birdRequirement04 = require('../../assets/Bird_04_compressed.jpg');
const birdRequirement05 = require('../../assets/Bird_05_compressed.jpg');
// 舊版圖片（保留備用）
const birdRequirementBad1 = require('../../assets/bird-requirement-bad-1.png');
const birdRequirementBad2 = require('../../assets/bird-requirement-bad-2.png');
const birdRequirementGood1 = require('../../assets/bird-requirement-good-1.png');
const birdRequirementGood2 = require('../../assets/bird-requirement-good-2.png');
const birdRequirementGood3 = require('../../assets/bird-requirement-good-3.png');

type Props = NativeStackScreenProps<RootStackParamList, 'BirdSubmit'>;

type PeriodOption = { id: string; label: string };

type LocalPhoto = {
  id: string;
  uri: string;
  location: PickedLocation | null;
  exifGps?: { latitude: number; longitude: number } | null;
  exif_datetime?: string | null;  // EXIF 拍攝時間
  assetId?: string; // For iOS duplicate detection
};



const MAX_PHOTOS = 6;

const FISH_PERIODS: PeriodOption[] = [
  { id: 'before_drawdown', label: '降水前' },
  { id: 'after_basic_day1', label: '基本\n降水後\n第1天' },
  { id: 'after_drying_day1', label: '乾塘後\n第1天' },
  { id: 'after_basic_day7', label: '基本\n降水後\n第7天' },
  { id: 'after_drying_day7', label: '乾塘後\n第7天' },
];

const BIRD_PERIODS: PeriodOption[] = [
  { id: 'non_drawdown_drying', label: '非降水/乾塘時' },
  { id: 'after_drying', label: '乾塘後' },
  { id: 'after_basic', label: '基本降水後' },
];

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function formatCoord(loc?: PickedLocation | null) {
  if (!loc) return '未選擇';
  return `${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}`;
}

async function fetchSubmittedPeriods(options: { pondUuid: string; category: string }): Promise<string[]> {
  try {
    const data = await functionsFetch<{ success: boolean; submitted_periods: string[] }>(
      '/get-submitted-periods',
      { body: { pond_uuid: options.pondUuid, category: options.category } },
    );
    return data.submitted_periods ?? [];
  } catch {
    return [];
  }
}

function avgCenter(points: Array<{ latitude: number; longitude: number }>) {
  if (!points.length) return { latitude: 22.495, longitude: 114.03 };
  const sum = points.reduce(
    (acc, p) => ({ latitude: acc.latitude + p.latitude, longitude: acc.longitude + p.longitude }),
    { latitude: 0, longitude: 0 }
  );
  return { latitude: sum.latitude / points.length, longitude: sum.longitude / points.length };
}

export function BirdSubmitScreen({ navigation, route }: Props) {
  const { user, userPonds, signOut, autoReSignIn } = useAuth();
  const stackNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const webRef = useRef<WebView | null>(null);
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<AppMode | null>(route.params?.type ?? null);
  const [cameFromTypeSelection, setCameFromTypeSelection] = useState(false);

  const [selectedPondUuid, setSelectedPondUuid] = useState<string | null>(route.params?.pondId ?? null);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(route.params?.period ?? null);
  const [submittedPeriods, setSubmittedPeriods] = useState<string[]>([]);

  const [picked, setPicked] = useState<PickedLocation | null>(route.params?.pickedLocation ?? null);

  const [pondModalVisible, setPondModalVisible] = useState(false);
  const [periodModalVisible, setPeriodModalVisible] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0, percent: 0 });
  const isUploadCancelledRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [hasGpsPermission, setHasGpsPermission] = useState<boolean | null>(null);
  const [isWebViewLoaded, setIsWebViewLoaded] = useState(false); // 追蹤 WebView 是否已加載
  const [currentPage, setCurrentPage] = useState(1); // 追蹤當前頁面：1, 2 或 3
  const [showCustomCamera, setShowCustomCamera] = useState(false); // 顯示自定義相機
  const [showPhotoSourceModal, setShowPhotoSourceModal] = useState(false); // 顯示相片來源選擇 Modal
  const [showPhotoRequirements, setShowPhotoRequirements] = useState(false); // 顯示相片要求
  const [galleryPreviewPhoto, setGalleryPreviewPhoto] = useState<LocalPhoto | null>(null); // 相冊選取的預覽照片
  const [isCheckingLocation, setIsCheckingLocation] = useState(false); // 正在檢查照片位置

  // 監聽 galleryPreviewPhoto 變化，用於調試
  useEffect(() => {
    if (galleryPreviewPhoto) {
      console.log('📂 galleryPreviewPhoto 已設置:', galleryPreviewPhoto.id, galleryPreviewPhoto.uri.substring(0, 50));
    } else {
      console.log('📂 galleryPreviewPhoto 為 null');
    }
  }, [galleryPreviewPhoto]);

  useEffect(() => {
    if (route.params?.type) {
      setMode(route.params.type);
      setCameFromTypeSelection(false); // 從首頁進入，不是從類型選擇界面
    }
  }, [route.params?.type]);

  useEffect(() => {
    const loc = route.params?.pickedLocation;
    if (loc) setPicked(loc);
  }, [route.params?.pickedLocation]);

  useEffect(() => {
    // 切換 fish/bird 重置階段與相片（魚塘保留，方便同一魚塘切換）
    setSelectedPeriod(null);
    setSubmittedPeriods([]);
    setPhotos([]);
    setIsWebViewLoaded(false); // 重置 WebView 加載狀態
    setCurrentPage(1); // 重置到第1頁
  }, [mode]);

  // 自動選擇第一個魚塘（如果還沒有選擇）
  useEffect(() => {
    if (!selectedPondUuid && userPonds.length > 0) {
      setSelectedPondUuid(userPonds[0].id);
    }
  }, [selectedPondUuid, userPonds]);

  // 處理header返回按鈕行為 - 攔截返回動作
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (currentPage === 3) {
        // 在第3頁時，阻止默認返回行為
        e.preventDefault();
        // 返回到第2頁
        setCurrentPage(2);
      }
      // 其他頁面允許正常返回
    });

    return unsubscribe;
  }, [navigation, currentPage]);

  const category = useMemo(() => (mode === 'fish' ? '魚塘相片' : '雀鳥相片'), [mode]);
  const title = useMemo(() => (mode === 'fish' ? '提交魚塘相片' : '提交雀鳥相片'), [mode]);
  const periods = useMemo(() => (mode === 'fish' ? FISH_PERIODS : BIRD_PERIODS), [mode]);
  const maxPhotos = useMemo(() => MAX_PHOTOS, [mode]); // 使用常量定義

  const selectedPond = useMemo(() => userPonds.find((p) => p.id === selectedPondUuid) || null, [selectedPondUuid, userPonds]);

  const availablePeriods = useMemo(() => periods.filter((p) => !submittedPeriods.includes(p.id)), [periods, submittedPeriods]);

  const canAddPhotos = photos.length < maxPhotos;

  const checkGpsPermission = async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        setHasGpsPermission(true);
        return true;
      } else if (status === 'denied') {
        setHasGpsPermission(false);
        return false;
      } else {
        setHasGpsPermission(null);
        return false;
      }
    } catch {
      setHasGpsPermission(null);
      return false;
    }
  };

  useEffect(() => {
    // 自動請求並獲取GPS位置
    const initGps = async () => {
      console.log('SubmitScreen: 初始化GPS...');
      const hasPermission = await checkGpsPermission();
      console.log('SubmitScreen: GPS權限狀態:', hasPermission);
      if (!hasPermission) {
        // 自動請求權限
        const location = await getCurrentLocation();
        console.log('SubmitScreen: 請求權限後獲取位置:', location);
      } else {
        // 已有權限，直接獲取位置
        const location = await getCurrentLocation();
        console.log('SubmitScreen: 已有權限，獲取位置:', location);
        if (location) {
          setPicked(location);
        }
      }
    };
    void initGps();
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!selectedPondUuid) {
        setSubmittedPeriods([]);
        return;
      }
      try {
        const data = await fetchSubmittedPeriods({ pondUuid: selectedPondUuid, category });
        setSubmittedPeriods(data);
      } catch {
        // 不阻塞使用者提交流程
        setSubmittedPeriods([]);
      }
    };
    void load();
  }, [selectedPondUuid, category]);

  const openSettings = async () => {
    try {
      await Linking.openSettings();
    } catch {
      Alert.alert('提示', '請到系統設定中開啟定位權限');
    }
  };

  const getCurrentLocation = async (): Promise<PickedLocation | null> => {
    const locStart = Date.now();
    try {
      const req = await Location.requestForegroundPermissionsAsync();
      if (req.status !== 'granted') {
        setHasGpsPermission(false);
        const elapsed = ((Date.now() - locStart) / 1000).toFixed(2);
        console.log(`⏱️ [定位] 權限被拒，耗時 ${elapsed}s`);
        return null;
      }

      // 方法 1: 先嘗試獲取最後已知位置（通常瞬間返回）
      try {
        const lastKnown = await Location.getLastKnownPositionAsync();
        if (lastKnown) {
          const location = { latitude: lastKnown.coords.latitude, longitude: lastKnown.coords.longitude };
          setPicked(location);
          setHasGpsPermission(true);
          const elapsed = ((Date.now() - locStart) / 1000).toFixed(2);
          console.log(`⏱️ [定位] 使用最後已知位置，耗時 ${elapsed}s`);
          return location;
        }
      } catch {
        // 靜默失敗，繼續嘗試 getCurrentPositionAsync
      }

      // 方法 2: 獲取當前位置
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 5000,
          distanceInterval: 0,
        });
        const location = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setPicked(location);
        setHasGpsPermission(true);
        const elapsed = ((Date.now() - locStart) / 1000).toFixed(2);
        console.log(`⏱️ [定位] GPS 定位成功，耗時 ${elapsed}s`);
        return location;
      } catch (error) {
        const elapsed = ((Date.now() - locStart) / 1000).toFixed(2);
        console.log(`⏱️ [定位] 無法獲取位置，耗時 ${elapsed}s:`, error);
        setHasGpsPermission(false);
        return null;
      }
    } catch {
      setHasGpsPermission(false);
      return null;
    }
  };

  const openCamera = () => {
    if (!canAddPhotos) return;
    // 確保在第3頁打開相機
    setCurrentPage(3);
    setShowCustomCamera(true);
  };

  // 檢查照片是否已存在（根據文件名或 URI 判斷）
  // 獲取文件信息的異步函數
  const getFileInfo = async (fileUri: string): Promise<{ size: number; modificationTime: number } | null> => {
    try {
      const info = await FileSystem.getInfoAsync(fileUri);
      if (info.exists) {
        return {
          size: info.size || 0,
          modificationTime: info.modificationTime || 0,
        };
      }
      return null;
    } catch (e) {
      return null;
    }
  };

  // 檢查是否為重複照片（異步版本，更準確）
  const checkPhotoDuplicateAsync = async (
    uri: string,
    fileName: string,
    assetId: string, // iOS assetId from ImagePicker
    existingPhotos: LocalPhoto[]
  ): Promise<boolean> => {
    const normalizeUri = (u: string): string => {
      return u.split('?')[0].replace(/%20/g, ' ').toLowerCase();
    };

    console.log('📂 檢查重複:', { fileName, assetId, count: existingPhotos.length });

    // 獲取新照片的文件信息（用於 Android 更準確的重複檢測）
    let newFileInfo: { size: number; modificationTime: number } | null = null;
    if (Platform.OS === 'android') {
      newFileInfo = await getFileInfo(uri);
      console.log('📂 新照片文件信息:', newFileInfo);
    }

    for (const photo of existingPhotos) {
      // Primary: Compare Asset ID (persistent across selections on iOS)
      if (assetId && photo.assetId && assetId === photo.assetId) {
        console.log('📂 ✅ Asset ID 重複');
        return true;
      }
      // Fallback: Compare normalized URI
      if (normalizeUri(photo.uri) === normalizeUri(uri)) {
        console.log('📂 ✅ URI 重複');
        return true;
      }
      // Android: Compare file size for more accurate duplicate detection
      if (Platform.OS === 'android' && newFileInfo) {
        const existingFileInfo = await getFileInfo(photo.uri);
        if (existingFileInfo && newFileInfo.size === existingFileInfo.size && newFileInfo.size > 0) {
          console.log('📂 ✅ 文件大小相同，可能是重複');
          return true;
        }
      }
    }

    console.log('📂 ❌ 未發現重複');
    return false;
  };

  // 同步版本（用於相機拍照）
  const isPhotoDuplicate = (uri: string, fileName?: string): boolean => {
    const normalizeUri = (u: string): string => {
      return u.split('?')[0].replace(/%20/g, ' ').toLowerCase();
    };
    
    const normalizedNewUri = normalizeUri(uri);
    const newFileName = fileName?.toLowerCase() || '';
    
    return photos.some((photo, index) => {
      if (normalizeUri(photo.uri) === normalizedNewUri) {
        console.log(`📂 重複檢測: URI 匹配 (索引 ${index})`);
        return true;
      }
      
      if (newFileName && photo.id.toLowerCase().includes(newFileName)) {
        console.log(`📂 重複檢測: 文件名匹配 (索引 ${index})`);
        return true;
      }
      
      return false;
    });
  };

  const handleCameraCapture = async (uri: string, exifDatetime?: string) => {
    // 檢查數量限制
    if (photos.length >= maxPhotos) {
      Alert.alert('提示', `最多只能上傳 ${maxPhotos} 張相片`);
      return;
    }

    // 檢查是否重複（相機拍照通常不會重複，但為了安全起見）
    if (isPhotoDuplicate(uri)) {
      Alert.alert('提示', '此相片已經選擇過，不能重複添加');
      return;
    }

    const now = Date.now();
    const photoId = `${uri}-${now}`;
    const timestamp = new Date().toISOString();

    // 相機拍攝：直接使用系統 GPS 作為 EXIF GPS（拍攝位置 = 當前位置）
    const currentLocation = picked || (await getCurrentLocation()) || null;

    const newPhoto: LocalPhoto = {
      id: photoId,
      uri,
      location: currentLocation,
      exifGps: currentLocation ? { latitude: currentLocation.latitude, longitude: currentLocation.longitude } : undefined,
      exif_datetime: exifDatetime || timestamp,  // 優先使用相機 EXIF 拍攝時間
    };
    setPhotos((prev) => [...prev, newPhoto]);

    console.log('📷 相機拍攝照片:', {
      photoId,
      location: currentLocation,
      exif_datetime: timestamp
    });
  };

  const handleCameraComplete = () => {
    // 完成拍攝，關閉相機，確保返回第3頁顯示照片
    setShowCustomCamera(false);
    setCurrentPage(3);
  };

  const handleCameraCancel = () => {
    setShowCustomCamera(false);
  };

  const handleCameraDelete = (photoId: string) => {
    setPhotos(prev => prev.filter(p => p.id !== photoId));
  };

  const openGallery = async () => {
    if (!canAddPhotos) return;

    setCurrentPage(3);

    const pickedLoc = picked || null;
    const now = Date.now();

    // iOS 使用 ImagePicker，Android 使用 DocumentPicker
    const isIOS = Platform.OS === 'ios';
    console.log(`📂 使用 ${isIOS ? 'ImagePicker' : 'DocumentPicker'} 選擇照片...`);

    try {
      let uri: string;
      let fileName: string;
      let iosAssetId: string | undefined; // iOS: 用於重複檢查的 Asset ID

      if (isIOS) {
        // iOS: 使用 ImagePicker（更穩定）
        console.log('📂 iOS: 檢查相片庫權限...');
        
        // 先檢查當前權限狀態
        const { status: existingStatus } = await ImagePicker.getMediaLibraryPermissionsAsync();
        console.log('📂 iOS: 當前權限狀態:', existingStatus);
        
        let finalStatus = existingStatus;
        
        // 如果還沒有權限，請求權限
        if (existingStatus !== 'granted') {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          finalStatus = status;
          console.log('📂 iOS: 請求後權限狀態:', status);
        }
        
        if (finalStatus !== 'granted') {
          Alert.alert(
            '需要相片庫權限',
            '請在設定中允許存取相片庫以選擇照片',
            [
              { text: '取消', style: 'cancel' },
              { text: '前往設定', onPress: () => Linking.openSettings() }
            ]
          );
          return;
        }

        console.log('📂 iOS: 啟動 ImagePicker...');
        console.log('📂 iOS: ImagePicker 配置:', { mediaTypes: ['images'], allowsEditing: false, quality: 1, exif: true });
        
        let result;
        try {
          result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: false,
            quality: 1,
            exif: true,
          });
          
          console.log('📂 iOS: ImagePicker 結果:', JSON.stringify(result));
        } catch (pickerError) {
          console.error('📂 iOS: ImagePicker 調用失敗:', pickerError);
          throw pickerError;
        }

        if (result.canceled || !result.assets || result.assets.length === 0) {
          console.log('📂 用戶取消選擇');
          return;
        }

        const asset = result.assets[0];
        uri = asset.uri;
        fileName = asset.uri.split('/').pop() || `IMG_${now}.jpg`;
        // iOS: 獲取 assetId 用於重複檢查
        iosAssetId = (asset as any).assetId as string | undefined;
        
        console.log('📂 iOS: 完整 asset 數據:', JSON.stringify({
          uri: asset.uri?.substring(0, 100),
          width: asset.width,
          height: asset.height,
          fileName: (asset as any).fileName,
          assetId: iosAssetId,
        }));
        
        console.log(`📂 iOS 選擇了照片: ${fileName}, assetId: ${iosAssetId}`);
      } else {
        // Android: 使用 DocumentPicker
        const res = await DocumentPicker.getDocumentAsync({
          type: ['image/*'],
          copyToCacheDirectory: true,
          multiple: false,
        });

        if (res.canceled || !res.assets || res.assets.length === 0) {
          console.log('📂 用戶取消選擇');
          return;
        }

        const asset = res.assets[0];
        uri = asset.uri;
        fileName = asset.name || `IMG_${now}.jpg`;
        
        console.log(`📂 Android 選擇了照片: ${fileName}`);
      }

      // 檢查重複照片（使用異步版本更準確）
      // iOS: 傳入 assetId 用於重複檢查（Android 傳空字符串）
      const assetIdForDuplicateCheck = Platform.OS === 'ios' ? iosAssetId : '';
      const isDuplicate = await checkPhotoDuplicateAsync(uri, fileName, assetIdForDuplicateCheck || '', photos);
      if (isDuplicate) {
        Alert.alert('提示', '此相片已經選擇過，不能重複添加');
        return;
      }

      console.log(`📂 處理 ${fileName}...`);

      // 顯示「正在檢查位置」提示
      setIsCheckingLocation(true);

      // 提取 GPS - 方法 1: 本地提取
      let gpsData: { latitude: number; longitude: number } | null = null;
      let exif_datetime: string | null = null;
      const gpsCheckStart = Date.now();

      const localResult = await checkPhotoGPS(uri, undefined);
      if (localResult.hasGPS && localResult.gps) {
        gpsData = localResult.gps;
        console.log(`📂 ${fileName} - 本地提取 GPS:`, gpsData);
      }
      // 使用本地提取的 EXIF 時間
      if (localResult.datetime) {
        exif_datetime = localResult.datetime;
        console.log(`📂 ${fileName} - 本地提取時間: ${exif_datetime}`);
      }

      // 本地提取已完成（file-parse + media-library 並行），不再調用後端 API
      // 二進制 EXIF 解析器已涵蓋所有格式，後端 API 僅增加 60s 延遲而無益處
      const gpsCheckElapsed = ((Date.now() - gpsCheckStart) / 1000).toFixed(2);
      console.log(`⏱️ [總計] ${fileName} GPS 檢查完成，耗時 ${gpsCheckElapsed}s，GPS: ${gpsData ? '✅' : '❌'}，時間: ${exif_datetime ? '✅' : '❌'}`);

      // 創建臨時照片對象，顯示預覽
      const previewPhoto: LocalPhoto = {
        id: `${uri}-${now}`,
        uri: uri,
        location: gpsData ? { latitude: gpsData.latitude, longitude: gpsData.longitude } : pickedLoc,
        exifGps: gpsData ?? undefined,
        exif_datetime: exif_datetime ?? undefined,
        assetId: iosAssetId, // iOS: 保存 assetId 用於重複檢查
      };

      console.log('📂 創建預覽照片:', previewPhoto.id);
      
      // 關閉「正在檢查位置」提示
      setIsCheckingLocation(false);
      
      // 顯示預覽
      setGalleryPreviewPhoto(previewPhoto);
      console.log('📂 已調用 setGalleryPreviewPhoto');

    } catch (error: any) {
      // 發生錯誤時也要關閉提示
      setIsCheckingLocation(false);
      console.error('📂 選擇照片錯誤:', error);
      Alert.alert('錯誤', '無法選擇照片: ' + (error.message || '未知錯誤'));
    }
  };

  const handleGalleryConfirm = () => {
    if (galleryPreviewPhoto) {
      setPhotos((prev) => [...prev, galleryPreviewPhoto]);
      
      // 如果沒有位置，嘗試獲取當前位置
      if (!galleryPreviewPhoto.location && !picked) {
        getCurrentLocation()
          .then((newLocation) => {
            if (newLocation) setPicked(newLocation);
          })
          .catch(() => {});
      }
      
      setGalleryPreviewPhoto(null);
    }
  };

  const handleGalleryCancel = () => {
    setGalleryPreviewPhoto(null);
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const openPondSelect = () => {
    setPondModalVisible(true);
  };

  const handleSelectPeriod = (periodId: string) => {
    if (submittedPeriods.includes(periodId)) return;
    setSelectedPeriod(periodId);
  };

  const validateForm = (): boolean => {
    if (!selectedPondUuid) {
      Alert.alert('提示', '請選擇魚塘');
      return false;
    }
    if (!selectedPeriod) {
      Alert.alert('提示', '請選擇降水工作階段');
      return false;
    }
    if (photos.length === 0) {
      Alert.alert('提示', '請至少選擇一張相片');
      return false;
    }
    return true;
  };

  const onSubmitPress = () => {
    console.log('=== 提交按鈕被點擊 ===');
    console.log('selectedPondUuid:', selectedPondUuid);
    console.log('selectedPeriod:', selectedPeriod);
    console.log('photos.length:', photos.length);
    console.log('currentPage:', currentPage);
    
    if (!validateForm()) {
      console.log('驗證失敗');
      return;
    }
    
    console.log('驗證成功，顯示免責聲明');
    setShowDisclaimer(true);
  };

  const doSubmit = async () => {
    if (!validateForm()) return;
    setShowDisclaimer(false);
    setIsUploading(true);
    setIsCancelling(false);
    abortControllerRef.current = new AbortController();
    setUploadProgress({ current: 0, total: photos.length, percent: 0 });

    try {
      console.log('=== 開始提交照片 ===');
      console.log('照片數量:', photos.length);

      // 若任何照片缺少 GPS，在上傳前最後一次嘗試獲取位置
      let fallbackLoc = picked;
      const anyMissingGps = photos.some((p) => !p.location?.latitude || !p.location?.longitude);
      if (anyMissingGps) {
        try {
          const lastLoc = await getCurrentLocation();
          if (lastLoc) fallbackLoc = lastLoc;
        } catch {
          // 靜默失敗
        }
      }

      const timestamp = new Date().toISOString();
      const uploadLoc = fallbackLoc ?? picked;

      for (let i = 0; i < photos.length; i++) {
        // 檢查是否已取消上傳
        if (isUploadCancelledRef.current) {
          console.log('用戶取消上傳');
          setIsUploading(false);
          setIsCancelling(false);
          setUploadProgress({ current: 0, total: 0, percent: 0 });
          isUploadCancelledRef.current = false;
          Alert.alert('已取消', '已經取消上傳');
          return;
        }

        const p = photos[i];

        // 更新進度
        const percent = Math.round(((i) / photos.length) * 100);
        setUploadProgress({ current: i + 1, total: photos.length, percent });

        console.log(`正在上傳第 ${i + 1}/${photos.length} 張照片...`);

        const filename = `${mode}_${timestamp.replace(/[:.]/g, '-')}_${i + 1}.jpg`;
        let storagePath: string | undefined;

        const signal = abortControllerRef.current?.signal;

        // Step 1: 獲取上傳 URL（Edge Function 回傳直接 POST URL）
        console.log(`📋 [Step 1/3] 獲取上傳 URL... (owner_id: ${user?.owner_id}, owner_uuid: ${user?.owner_uuid}, file: ${filename})`);
        const urlResult = await getSignedUploadUrl(
          user?.owner_id ?? '',
          filename,
          'bird',
          signal,
        );

        if (!urlResult.success || !urlResult.upload_url || !urlResult.storage_path) {
          throw new Error(`[步驟1] 獲取上傳 URL 失敗: ${urlResult.error || '未知錯誤'}`);
        }
        storagePath = urlResult.storage_path;
        console.log(`✅ [Step 1/3] 上傳 URL 獲取成功 (method: ${urlResult.method || 'POST'})`);

        // Step 2: 直接 POST 上傳到 Storage
        console.log(`📤 [Step 2/3] POST 上傳到 Storage... (${p.uri})`);
        const uploadResult = await uploadFileToStorage(
          urlResult.upload_url,
          p.uri,
          'image/jpeg',
          signal,
        );

        if (!uploadResult.success) {
          throw new Error(`[步驟2] 文件上傳失敗: ${uploadResult.error || '未知錯誤'}`);
        }
        console.log(`✅ [Step 2/3] 文件上傳成功`);

        console.log('GPS位置:', '上傳位置:', uploadLoc, 'EXIF:', p.exifGps, 'EXIF時間:', p.exif_datetime);

        // 將 EXIF 本地時間轉換為 UTC ISO 格式（加上 Z 後綴）
        // EXIF 時間沒有時區信息，代表拍攝地的本地時間（香港 UTC+8）
        // 必須轉換為 UTC 後再發送給伺服器，否則 PostgreSQL 會誤解為 UTC 時間
        const exifDatetimeUtc = p.exif_datetime
          ? new Date(p.exif_datetime).toISOString()
          : undefined;

        const body: Record<string, unknown> = {
          owner_id: user?.owner_id ?? '',  // 短 ID (如 F001)，向後兼容
          owner_uuid: user?.owner_uuid ?? '',  // UUID (owners.id)，用於 bird_submissions 表的 RLS 匹配
          filename,
          pond_id: selectedPond?.pond_id ?? undefined,  // 魚塘編號 (如 R01)
          pond_uuid: selectedPondUuid ?? undefined,      // 魚塘 UUID
          category,
          rainfall_phase: selectedPeriod ?? undefined,
          phase: 1,
          // EXIF 數據（客戶端提取）
          exif_latitude: p.exifGps?.latitude != null && !isNaN(Number(p.exifGps.latitude)) ? Number(p.exifGps.latitude) : undefined,
          exif_longitude: p.exifGps?.longitude != null && !isNaN(Number(p.exifGps.longitude)) ? Number(p.exifGps.longitude) : undefined,
          exif_datetime: exifDatetimeUtc,
          // 上傳位置（客戶端裝置 GPS）
          upload_latitude: uploadLoc?.latitude != null && !isNaN(Number(uploadLoc.latitude)) ? Number(uploadLoc.latitude) : undefined,
          upload_longitude: uploadLoc?.longitude != null && !isNaN(Number(uploadLoc.longitude)) ? Number(uploadLoc.longitude) : undefined,
          // 時間戳
          photo_taken_at: exifDatetimeUtc || timestamp,
          submission_timestamp: timestamp,
        };

        if (storagePath) {
          body.storage_path = storagePath;
        }

        Object.keys(body).forEach((k) => body[k] === undefined && delete body[k]);
        console.log(`📝 [Step 3/3] 提交數據 (owner_id=${body.owner_id}, owner_uuid=${body.owner_uuid}):`, JSON.stringify({ ...body, storage_path: body.storage_path }));

        // Step 3: 提交記錄到後端
        console.log(`📝 [Step 3/3] 提交記錄到後端 (endpoint: /app-submit-bird-photo)...`);
        await functionsFetch<unknown>('/app-submit-bird-photo', {
          method: 'POST',
          body,
          signal,
        }).catch((err) => {
          throw new Error(`[步驟3] 提交記錄失敗: ${err instanceof Error ? err.message : '未知錯誤'}`);
        });

        console.log(`✅ [Step 3/3] 第 ${i + 1} 張照片提交成功`);
      }
      
      // 完成時設為 100%
      setUploadProgress({ current: photos.length, total: photos.length, percent: 100 });

      console.log('=== 所有照片提交成功 ===');

      // 將已提交的階段加入列表
      if (selectedPeriod) {
        setSubmittedPeriods(prev => [...prev, selectedPeriod]);
      }

      // 顯示成功提示
      Alert.alert('成功', '相片已成功提交');

      // 重置状态
      setPhotos([]);
      setSelectedPeriod(null);
      setCurrentPage(1);

      // 导航到主頁
      stackNav.navigate('Main', { screen: 'Home' });
    } catch (e: unknown) {
      // 如果是用戶主動取消，不顯示錯誤
      if (isUploadCancelledRef.current) {
        console.log('用戶取消上傳');
        Alert.alert('已取消', '已經取消上傳');
        return;
      }
      console.error('=== 提交失敗 ===');
      console.error('錯誤對象:', e);
      
      const errorMsg = e instanceof Error ? e.message : '請稍後再試';
      console.error('錯誤信息:', errorMsg);
      
      if (e instanceof Error && e.stack) {
        console.error('錯誤堆棧:', e.stack);
      }
      
      if ((errorMsg && typeof errorMsg === 'string') && (errorMsg.includes('登入憑證已過期') || errorMsg.includes('401'))) {
        // 尝试自动重新登入
        const reSignInResult = await autoReSignIn();
        if (reSignInResult.success) {
          Alert.alert('提示', '登入已更新，請重新提交');
        } else {
          Alert.alert(
            '登入已過期',
            '您的登入憑證已過期，請重新登入',
            [
              {
                text: '重新登入',
                onPress: async () => {
                  await signOut();
                },
              },
            ],
            { cancelable: false }
          );
        }
      } else {
        Alert.alert('提交失敗', errorMsg || '請稍後再試');
      }
    } finally {
      setIsUploading(false);
      setIsCancelling(false);
      abortControllerRef.current = null;
      setUploadProgress({ current: 0, total: 0, percent: 0 });
      isUploadCancelledRef.current = false;
    }
  };

  const [isCancelling, setIsCancelling] = useState(false);

  const handleCancelUpload = () => {
    setIsCancelling(true);
    isUploadCancelledRef.current = true;
    abortControllerRef.current?.abort();
  };

  const pondsWithLocation = useMemo(
    () => {
      const filtered = userPonds.filter((p) => typeof p.latitude === 'number' && typeof p.longitude === 'number') as Array<
        (typeof userPonds)[number] & { latitude: number; longitude: number }
      >;
      console.log('SubmitScreen: userPonds總數:', userPonds.length);
      console.log('SubmitScreen: 有位置的魚塘數:', filtered.length);
      if (userPonds.length > 0 && filtered.length === 0) {
        console.log('SubmitScreen: ⚠️ 所有魚塘都沒有位置信息！');
        console.log('SubmitScreen: 第一個魚塘數據:', JSON.stringify(userPonds[0]));
      }
      return filtered;
    },
    [userPonds]
  );

  const pondMapHtml = useMemo(() => {
    const center = avgCenter(pondsWithLocation.map((p) => ({ latitude: p.latitude, longitude: p.longitude })));

    // On mobile we use Leaflet (OSM) to avoid native map crashes on Android.
    const markers = pondsWithLocation
      .map((p) => {
        const title = `${p.pond_id || ''}${p.name ? ` · ${p.name}` : ''}`.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const pondId = (p.pond_id || '').replace(/'/g, "\\'");
        return `
          (function(){
            // 存儲魚塘位置
            pondLocations['${p.id}'] = { lat: ${p.latitude}, lng: ${p.longitude} };
            
            // 默認使用藍色標記
            var m = L.marker([${p.latitude}, ${p.longitude}], { 
              pondId: '${p.id}',
              title: '${title}'
            });
            m.addTo(map);
            markers['${p.id}'] = m;
            
            // 使用 mouseup 和 touchend 事件，這些在移動設備上更可靠
            var handleSelect = function(e) {
              try {
                addLog('🔵 選擇魚塘: ${p.pond_id || p.id}');
                console.log('Marker selected:', '${p.id}');
                
                if (e && e.originalEvent) {
                  L.DomEvent.stopPropagation(e);
                  L.DomEvent.preventDefault(e);
                }
                
                // 更新標記顏色（選中變紅色）
                if (window.updateMarkerColors) {
                  addLog('調用 updateMarkerColors');
                  window.updateMarkerColors('${p.id}');
                  addLog('顏色已更新');
                } else {
                  addLog('⚠️ updateMarkerColors 未定義');
                }
                
                // 點擊後立即將地圖居中到該魚塘 - 使用 flyTo 效果更明顯
                addLog('準備居中地圖...');
                map.flyTo([${p.latitude}, ${p.longitude}], 17, {
                  animate: true,
                  duration: 1
                });
                addLog('✓ 已調用 flyTo 居中');
                
                // 通知 React Native 更新選中狀態
                if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                  addLog('發送消息到RN...');
                  var message = JSON.stringify({ pondId: '${p.id}', action: 'selectPond' });
                  window.ReactNativeWebView.postMessage(message);
                  addLog('✓ 已發送: ${p.pond_id || p.id}');
    } else {
                  addLog('✗ ReactNativeWebView不可用');
                }
              } catch(err) {
                addLog('❌ 錯誤: ' + err.message);
                console.error('Select error:', err);
              }
            };
            
            // 添加事件監聽器 - 使用統一的處理函數
            addLog('綁定事件到: ${p.pond_id || p.id}');
            
            // 優先使用 Leaflet 的 tap 事件（移動設備優化）
            m.on('tap', function(e) {
              addLog('👆 tap事件: ${p.pond_id || p.id}');
              if (e && e.originalEvent) {
                e.originalEvent.preventDefault();
                e.originalEvent.stopPropagation();
              }
              L.DomEvent.stop(e);
              handleSelect(e);
            });
            
            // 備用：click 事件（桌面瀏覽器）
            m.on('click', function(e) {
              addLog('📍 click事件: ${p.pond_id || p.id}');
              if (e && e.originalEvent) {
                e.originalEvent.preventDefault();
                e.originalEvent.stopPropagation();
              }
              L.DomEvent.stop(e);
              handleSelect(e);
            });
            
            // 添加文字標籤
            var label = L.marker([${p.latitude}, ${p.longitude}], {
              icon: L.divIcon({
                className: 'pond-label',
                html: '<div class="label-text">${pondId}</div>',
                iconSize: [60, 20],
                iconAnchor: [30, -8]
              })
            });
            label.addTo(map);
            labels.push(label);
          })();
        `;
      })
      .join('\n');

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { 
      height: 100%; 
      width: 100%; 
      margin: 0; 
      padding: 0; 
      overflow: hidden;
      touch-action: none; /* 禁用瀏覽器默認觸摸行為 */
    }
    * {
      -webkit-user-select: none;
      -webkit-touch-callout: none;
    }
    .pond-label {
      background: transparent;
      border: none;
      pointer-events: none;
    }
    .label-text {
      background: rgba(255, 255, 255, 0.9);
      border: 1px solid #E5E7EB;
      border-radius: 4px;
      padding: 2px 6px;
      font-size: 11px;
      font-weight: 700;
      color: #111827;
      text-align: center;
      white-space: nowrap;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      opacity: 0;
      transition: opacity 0.2s;
      pointer-events: none;
    }
    .show-labels .label-text {
      opacity: 1;
    }
    /* 隱藏 Leaflet logo 和 attribution */
    .leaflet-control-attribution {
      display: none !important;
    }
    .leaflet-bottom.leaflet-right {
      display: none !important;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    (function(){
      var debugLogs = [];
      
      window.addLog = function(msg) {
        var time = new Date().toLocaleTimeString();
        debugLogs.push('[' + time + '] ' + msg);
        console.log('WebView:', msg); // 輸出到控制台
        
        // 同時發送重要的調試信息到 React Native
        if (msg.includes('click') || msg.includes('touch') || msg.includes('mouse') || 
            msg.includes('選擇') || msg.includes('更新') || msg.includes('錯誤') || 
            msg.includes('⚠️') || msg.includes('❌')) {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            try {
              window.ReactNativeWebView.postMessage(JSON.stringify({ 
                action: 'debug', 
                message: msg 
              }));
            } catch(e) {
              console.error('Failed to send debug message:', e);
            }
          }
        }
      }
      
      addLog('地圖初始化開始...');
      console.log('Map initializing...');
      
      // 將 map 設為全局變量，以便從外部 JavaScript 訪問
      window.map = L.map('map', { 
        zoomControl: true,
        tap: true,
        tapTolerance: 15,
        touchZoom: true,
        scrollWheelZoom: false,
        doubleClickZoom: true,
        boxZoom: true,
        dragging: true,
        trackResize: true,
        attributionControl: false // 禁用 attribution 控制
      }).setView([${center.latitude}, ${center.longitude}], 17);
      
      var map = window.map; // 保持局部引用以便內部使用
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '' }).addTo(map);
      
      // 也將這些變為全局變量
      window.labels = [];
      window.pondLocations = {};
      window.markers = {};
      
      var labels = window.labels;
      var pondLocations = window.pondLocations;
      var markers = window.markers;
      
      addLog('添加標記點...');
      console.log('Adding markers...');
      ${markers}
      addLog('標記點數量: ' + Object.keys(markers).length);
      addLog('標記IDs: ' + Object.keys(markers).join(', '));
      console.log('Markers added:', Object.keys(markers).length);
      
      // 定義藍色和紅色圖標
      window.blueIcon = L.icon({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
      });
      
      window.redIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
      });
      
      // 更新標記顏色的函數
      window.updateMarkerColors = function(selectedId) {
        addLog('🎨 更新標記顏色: ' + selectedId);
        var count = 0;
        Object.keys(markers).forEach(function(id) {
          var marker = markers[id];
          var isSelected = id === selectedId;
          marker.setIcon(isSelected ? window.redIcon : window.blueIcon);
          count++;
        });
        addLog('✓ 已更新 ' + count + ' 個標記');
      };
      
      addLog('✓ 標記已創建');
      addLog('可用標記: ' + Object.keys(markers).length);
      
      // 控制標籤顯示：縮放級別 >= 15 時顯示
      function updateLabels() {
        var zoom = map.getZoom();
        var mapElement = document.getElementById('map');
        if (zoom >= 15) {
          mapElement.classList.add('show-labels');
        } else {
          mapElement.classList.remove('show-labels');
        }
      }
      
      map.on('zoomend', updateLabels);
      updateLabels();
      
      // 全局地圖點擊檢測（調試用）
      map.on('click', function(e) {
        addLog('🗺️ 地圖被點擊: ' + e.latlng.lat.toFixed(4) + ', ' + e.latlng.lng.toFixed(4));
      });
      
      // 檢測任何觸摸事件
      var mapElement = document.getElementById('map');
      mapElement.addEventListener('touchstart', function(e) {
        addLog('👆 地圖touchstart');
      });
      mapElement.addEventListener('touchend', function(e) {
        addLog('👆 地圖touchend');
      });
      
      addLog('地圖就緒，請嘗試點擊紅點');
      addLog('紅點數量: ' + Object.keys(markers).length);
      
      console.log('Map ready');
    })();
  </script>
</body>
</html>`;
  }, [pondsWithLocation]); // 移除 selectedPondUuid 依賴，避免頻繁重新加載 WebView

  const statusBarHeight = Platform.OS === 'android' ? StatusBar.currentHeight || 0 : insets.top;

  // 如果還沒選擇類型，顯示類型選擇界面
  if (!mode) {
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
        {/* 頂部標題 */}
        <View style={[styles.header, { paddingTop: statusBarHeight + 16 }]}>
          <Text style={styles.title}>提交相片</Text>
        </View>
        <View style={{ flex: 1 }}>
          
          <Text style={styles.typeSelectionTitle}>請選擇要提交的相片類別</Text>
          
          <View style={styles.typeSelectionContainer}>
          <View style={styles.typeIconsContainer}>
            <Pressable 
              style={[styles.typeIconButton, { marginTop: -15 }]}
              onPress={() => {
                setMode('fish');
                setCameFromTypeSelection(true);
                // 選擇後自動啟動 GPS
                void getCurrentLocation();
              }}
            >
              <FishPondSubmitIcon size={176} />
              <Text style={styles.typeIconLabel}>魚塘相片</Text>
        </Pressable>

            <Pressable 
              style={[styles.typeIconButton, { marginTop: 15 }]}
              onPress={() => {
                setMode('bird');
                setCameFromTypeSelection(true);
                // 選擇後自動啟動 GPS
                void getCurrentLocation();
              }}
            >
              <BirdSubmitIcon size={176} />
              <Text style={styles.typeIconLabel}>雀鳥相片</Text>
            </Pressable>
      </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {/* 頂部標題 */}
      <View style={[styles.header, { paddingTop: statusBarHeight + 16 }]}>
        <Pressable 
          onPress={() => {
            if (currentPage === 2) {
              // 在第二頁時，返回第一頁
              setCurrentPage(1);
            } else if (cameFromTypeSelection) {
              // 如果從類型選擇界面進入，返回到類型選擇界面
              setMode(null);
              setCameFromTypeSelection(false);
            } else {
              // 如果從首頁或其他頁面進入，使用導航返回
              if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                // 如果不能返回，導航到首頁
                stackNav.navigate('Main', { screen: 'Home' });
              }
            }
          }} 
          style={[styles.backButton, { marginTop: statusBarHeight + 16 }]}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </Pressable>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>{mode === 'fish' ? '提交魚塘相片' : '提交雀鳥相片'}</Text>
        </View>
      </View>
      <ScrollView style={{ backgroundColor: '#fff' }} contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}>

        {/* 第1頁：魚塘選擇 - 下拉菜單 */}
        {currentPage === 1 && (
          <View style={styles.block}>
            <Text style={styles.label}>選擇魚塘</Text>
            <Pressable style={styles.selectCard} onPress={openPondSelect}>
              <Text style={styles.selectCardLabel}>魚塘編號</Text>
              <Text style={styles.selectCardValue}>
                {selectedPond ? selectedPond.pond_id : '請選擇魚塘'}
              </Text>
                </Pressable>
          </View>
        )}

        {/* 第1頁：地圖顯示魚塘位置 */}
        {currentPage === 1 && pondsWithLocation.length > 0 && (
          <View style={styles.block}>
            <Text style={styles.label}>魚塘位置地圖</Text>
            
            {/* 調試信息區域 */}
            
            <View 
              style={styles.mapWrap}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
            >
              <WebView
                ref={(r) => {
                  webRef.current = r;
                }}
                originWhitelist={['*']}
                source={{ html: pondMapHtml }}
                onLoadEnd={() => {
                  // 只在首次加載時設置選中魚塘
                  if (!isWebViewLoaded) {
                    setIsWebViewLoaded(true);
                    
                    // WebView 加載完成後，如果有選中的魚塘，更新顏色並居中
                    if (selectedPondUuid && webRef.current) {
                      setTimeout(() => {
                        if (webRef.current) {
                          webRef.current.injectJavaScript(`
                            (function() {
                              var pondId = '${selectedPondUuid}';
                              var attempts = 0;
                              var maxAttempts = 10;
                              
                              function tryInitMap() {
                                attempts++;
                                
                                try {
                                  // 使用 window.map 訪問全局對象
                                  if (typeof window.map === 'undefined' || !window.map || typeof window.map.flyTo !== 'function') {
                                    if (attempts < maxAttempts) {
                                      addLog('⏳ 初始化等待地圖... (嘗試 ' + attempts + '/' + maxAttempts + ')');
                                      setTimeout(tryInitMap, 100);
                                      return;
                                    } else {
                                      addLog('❌ 初始化地圖超時');
                                      return;
                                    }
                                  }
                                  
                                  var map = window.map;
                                  var pondLocations = window.pondLocations;
                                  
                                  addLog('✓ 地圖初始化完成 (第 ' + attempts + ' 次嘗試)');
                                  addLog('🔄 收到RN指令: 設置選中魚塘');
                                  
                                  if (window.updateMarkerColors) {
                                    addLog('調用 updateMarkerColors("' + pondId + '")');
                                    window.updateMarkerColors(pondId);
                                  } else {
                                    addLog('⚠️ updateMarkerColors 不存在');
                                  }
                                  
                                  if (pondLocations[pondId]) {
                                    var loc = pondLocations[pondId];
                                    addLog('初始居中到: ' + loc.lat.toFixed(6) + ', ' + loc.lng.toFixed(6));
                                    map.flyTo([loc.lat, loc.lng], 17, {
                                      animate: true,
                                      duration: 1
                                    });
                                    addLog('✓ 地圖已居中');
                                  } else {
                                    addLog('⚠️ 找不到魚塘位置: ' + pondId);
                                  }
                                } catch(err) {
                                  addLog('❌ 初始化錯誤: ' + err.message);
                                }
                              }
                              
                              tryInitMap();
                            })();
                            true;
                          `);
                        }
                      }, 200);
                    }
                  }
                }}
                onMessage={(e) => {
                  const msg = safeJsonParse<{ pondId?: string; action?: string; message?: string }>(e.nativeEvent.data);
                  
                  // 處理調試消息（靜默處理，不顯示）
                  if (msg?.action === 'debug') {
                    return;
                  }
                  
                  if (msg?.action === 'test') {
                    Alert.alert('WebView通信測試', '消息接收成功！\n' + (msg.message || ''));
                  } else if (msg?.pondId && msg?.action === 'selectPond') {
                    setSelectedPondUuid(msg.pondId);
                    setSelectedPeriod(null);
                    setCurrentPage(1); // 重置到第1頁
                    
                    // 確保 WebView 內的標記顏色已更新
                    setTimeout(() => {
                      if (webRef.current) {
                        webRef.current.injectJavaScript(`
                          if (window.updateMarkerColors) {
                            window.updateMarkerColors('${msg.pondId}');
                          }
                          true;
                        `);
                      }
                    }, 50);
                  }
                }}
                javaScriptEnabled
                domStorageEnabled
                scrollEnabled={true}
                nestedScrollEnabled={true}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                bounces={false}
                scalesPageToFit={true}
                overScrollMode="never"
                contentMode="mobile"
                style={styles.map}
              />
            </View>
          </View>
        )}

        {/* 第1頁：下一步按鈕 */}
        {currentPage === 1 && selectedPondUuid ? (
          <View style={styles.block}>
            {hasGpsPermission !== true && (
              <View style={styles.warningBox}>
                <Ionicons name="warning" size={16} color="#DC2626" />
                <Text style={styles.warningText}>無GPS訊號，請確保GPS已開啟且訊號良好</Text>
              </View>
            )}

            {/* 淚滴標籤區 */}
            <View style={styles.tagsContainer}>
              {/* 紅色淚滴標：已選魚塘 */}
              <View style={[styles.tearDropTag, styles.tearDropTagRed]}>
                <Ionicons name="water" size={14} color="#DC2626" />
                <Text style={[styles.tagLabel, styles.tagLabelRed]}>已選魚塘</Text>
                <Text style={[styles.tagValue, styles.tagValueRed]}>
                  {selectedPond?.pond_id || ''}
                </Text>
              </View>

              {/* 藍色淚滴標：我的所有魚塘 */}
              <View style={[styles.tearDropTag, styles.tearDropTagBlue]}>
                <Ionicons name="water" size={14} color="#2563EB" />
                <Text style={[styles.tagLabel, styles.tagLabelBlue]}>我的所有魚塘</Text>
                <Text style={[styles.tagValue, styles.tagValueBlue]}>
                  {userPonds.length} 個
                </Text>
              </View>
            </View>

            <Pressable
              style={[
                styles.nextPageBtn,
                hasGpsPermission !== true && styles.disabled
              ]}
              onPress={async () => {
                if (hasGpsPermission === true) {
                  setCurrentPage(2);
                } else {
                  // 嘗試重新獲取GPS
                  const location = await getCurrentLocation();
                  if (location) {
                    setCurrentPage(2);
                  } else {
                    Alert.alert('無GPS訊號', '請確保GPS已開啟且訊號良好，或移動到空曠位置再試');
                  }
                }
              }}
              disabled={hasGpsPermission !== true}
            >
              <Text style={styles.nextPageText}>下一步</Text>
              <Ionicons name="arrow-forward" size={20} color="#111827" />
            </Pressable>
          </View>
        ) : null}

        {/* 第1頁：GPS位置顯示 */}
        {currentPage === 1 && (
          <View style={styles.block}>
            <View style={styles.gpsInfoCard}>
              <View style={styles.gpsInfoRow}>
                <Ionicons name="location" size={16} color={picked ? '#059669' : '#6B7280'} />
                <Text style={styles.gpsInfoLabel}>當前GPS位置</Text>
            </View>
              {picked ? (
                <Text style={styles.gpsInfoCoord}>{formatCoord(picked)}</Text>
              ) : (
                <View style={styles.gpsWarningRow}>
                  <Text style={styles.gpsWarningText}>未獲取GPS訊息</Text>
                <Pressable
                    style={styles.gpsSettingBtn}
                    onPress={() => void openSettings()}
                  >
                    <Ionicons name="settings" size={14} color="#111827" />
                    <Text style={styles.gpsSettingText}>設定GPS</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        )}

        {/* 第2頁：降水工作階段 */}
        {currentPage === 2 && selectedPondUuid ? (
          <View style={styles.block}>
            <Text style={styles.pageTitleLeft}>降水工作階段</Text>

            {/* 顯示已選擇的魚塘編號 - 米色背景 */}
            <View style={styles.pondIdCard}>
              <Text style={styles.pondIdCardText}>{selectedPond?.pond_id}</Text>
            </View>

            {/* 根據模式選擇不同的階段選擇方式 */}
            {mode === 'fish' ? (
              /* 魚塘：流程圖式階段選擇 */
              <View style={styles.flowChartContainer}>
                {/* 降水前按鈕（頂部居中） */}
                <View style={styles.flowTopRow}>
                  <Pressable
                    style={[
                      styles.flowButton,
                      selectedPeriod === 'before_drawdown' && styles.flowButtonSelected,
                      submittedPeriods.includes('before_drawdown') && styles.flowButtonSubmitted,
                      { backgroundColor: submittedPeriods.includes('before_drawdown') ? '#F3F4F6' : '#89C2D9' },
                    ]}
                    onPress={() => handleSelectPeriod('before_drawdown')}
                    disabled={submittedPeriods.includes('before_drawdown')}
                  >
                    <Text style={[styles.flowButtonText, submittedPeriods.includes('before_drawdown') && styles.flowButtonTextSubmitted]}>
                      降水前
                    </Text>
                  </Pressable>
                </View>

                {/* 連接線已移除 */}

                {/* 底部兩列按鈕 */}
                <View style={styles.flowBottomRow}>
                  {/* 左側：基本降水後 */}
                  <View style={styles.flowColumn}>
                    <Pressable
                      style={[
                        styles.flowButton,
                        selectedPeriod === 'after_basic_day1' && styles.flowButtonSelected,
                        submittedPeriods.includes('after_basic_day1') && styles.flowButtonSubmitted,
                        { backgroundColor: submittedPeriods.includes('after_basic_day1') ? '#F3F4F6' : '#C2F6F4' },
                      ]}
                      onPress={() => handleSelectPeriod('after_basic_day1')}
                      disabled={submittedPeriods.includes('after_basic_day1')}
                    >
                      <Text style={[styles.flowButtonText, submittedPeriods.includes('after_basic_day1') && styles.flowButtonTextSubmitted]}>
                        基本{'\n'}降水後{'\n'}第1天
                      </Text>
                    </Pressable>
                    <View style={styles.flowButtonGap} />
                    <Pressable
                      style={[
                        styles.flowButton,
                        selectedPeriod === 'after_basic_day7' && styles.flowButtonSelected,
                        submittedPeriods.includes('after_basic_day7') && styles.flowButtonSubmitted,
                        { backgroundColor: submittedPeriods.includes('after_basic_day7') ? '#F3F4F6' : '#C2F6F4' },
                      ]}
                      onPress={() => handleSelectPeriod('after_basic_day7')}
                      disabled={submittedPeriods.includes('after_basic_day7')}
                    >
                      <Text style={[styles.flowButtonText, submittedPeriods.includes('after_basic_day7') && styles.flowButtonTextSubmitted]}>
                        基本{'\n'}降水後{'\n'}第7天
                      </Text>
                    </Pressable>
                  </View>

                  {/* 中間分隔線 */}
                  <View style={styles.flowDivider} />

                  {/* 右側：乾塘後 */}
                  <View style={styles.flowColumn}>
                    <Pressable
                      style={[
                        styles.flowButton,
                        selectedPeriod === 'after_drying_day1' && styles.flowButtonSelected,
                        submittedPeriods.includes('after_drying_day1') && styles.flowButtonSubmitted,
                        { backgroundColor: submittedPeriods.includes('after_drying_day1') ? '#F3F4F6' : '#9DD4D1' },
                      ]}
                      onPress={() => handleSelectPeriod('after_drying_day1')}
                      disabled={submittedPeriods.includes('after_drying_day1')}
                    >
                      <Text style={[styles.flowButtonText, submittedPeriods.includes('after_drying_day1') && styles.flowButtonTextSubmitted]}>
                        乾塘後{'\n'}第1天{'\n'}
                      </Text>
                    </Pressable>
                    <View style={styles.flowButtonGap} />
                    <Pressable
                      style={[
                        styles.flowButton,
                        selectedPeriod === 'after_drying_day7' && styles.flowButtonSelected,
                        submittedPeriods.includes('after_drying_day7') && styles.flowButtonSubmitted,
                        { backgroundColor: submittedPeriods.includes('after_drying_day7') ? '#F3F4F6' : '#9DD4D1' },
                      ]}
                      onPress={() => handleSelectPeriod('after_drying_day7')}
                      disabled={submittedPeriods.includes('after_drying_day7')}
                    >
                      <Text style={[styles.flowButtonText, submittedPeriods.includes('after_drying_day7') && styles.flowButtonTextSubmitted]}>
                        乾塘後{'\n'}第7天{'\n'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : (
              /* 雀鳥：簡單三按鈕選擇 */
              <View style={styles.birdPeriodsContainer}>
                <Pressable
                  style={[
                    styles.birdPeriodButton,
                    selectedPeriod === 'after_basic' && styles.birdPeriodButtonSelected,
                    { backgroundColor: '#C2F6F4' },
                  ]}
                  onPress={() => handleSelectPeriod('after_basic')}
                >
                  <Text style={[styles.birdPeriodButtonText, selectedPeriod === 'after_basic' && styles.birdPeriodButtonTextSelected]}>
                    基本降水後
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.birdPeriodButton,
                    selectedPeriod === 'after_drying' && styles.birdPeriodButtonSelected,
                    { backgroundColor: '#9DD4D1' },
                  ]}
                  onPress={() => handleSelectPeriod('after_drying')}
                >
                  <Text style={[styles.birdPeriodButtonText, selectedPeriod === 'after_drying' && styles.birdPeriodButtonTextSelected]}>
                    乾塘後
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.birdPeriodButton,
                    selectedPeriod === 'non_drawdown_drying' && styles.birdPeriodButtonSelected,
                    { backgroundColor: '#89C2D9' },
                  ]}
                  onPress={() => handleSelectPeriod('non_drawdown_drying')}
                >
                  <Text style={[styles.birdPeriodButtonText, selectedPeriod === 'non_drawdown_drying' && styles.birdPeriodButtonTextSelected]}>
                    非降水／乾塘時
                  </Text>
                </Pressable>
              </View>
            )}

            {submittedPeriods.length > 0 ? (
              <Text style={styles.helper}>
                已提交階段：
                {submittedPeriods
                  .map((id) => periods.find((p) => p.id === id)?.label)
                  .filter(Boolean)
                  .join('、')}
              </Text>
            ) : null}

            {/* 第2頁：下一步按鈕（長期顯示，未選擇時禁用） */}
            <Pressable 
              style={[
                styles.nextPageBtn, 
                { marginTop: 20 },
                !selectedPeriod && styles.disabled
              ]}
              onPress={() => setCurrentPage(3)}
              disabled={!selectedPeriod}
            >
              <Text style={[styles.nextPageText, !selectedPeriod && { opacity: 0.5 }]}>下一步</Text>
              <Ionicons name="arrow-forward" size={20} color={selectedPeriod ? "#111827" : "#9CA3AF"} />
            </Pressable>
          </View>
        ) : null}

        {/* 第3頁：相片 */}
        {currentPage === 3 && selectedPeriod ? (
          <View style={styles.photoSection}>
            {/* 魚塘編號和降水階段資料欄 */}
            <View style={styles.infoCardsContainer}>
              <View style={styles.infoCardFull}>
                <Text style={styles.infoCardValue}>{selectedPond?.pond_id || '-'}</Text>
              </View>
              <View style={styles.infoCardFull}>
                <Text style={styles.infoCardValue}>
                  {periods.find((p) => p.id === selectedPeriod)?.label.replace(/\n/g, '') || '-'}
                </Text>
              </View>
            </View>

            {/* GPS 定位提示 */}
            <View style={styles.gpsReminderBox}>
              <Ionicons name="information-circle" size={14} color="#2563EB" />
              <Text style={styles.gpsReminderText}>
                請確保已開啟定位服務及允許存取權限，否則無法獲取相片位置資料
              </Text>
            </View>

            {/* 相片網格（3列，最多6張） */}
            <View style={styles.photoGridContainer}>
              <View style={styles.photoGridThreeColumn}>
                {/* 顯示已拍攝的照片 */}
                {photos.map((p) => (
                  <View key={p.id} style={styles.photoItemWithBorder}>
                    <Image source={{ uri: p.uri }} style={styles.photoThumbnail} />
                    <View style={styles.exifGpsBadge}>
                      <Text style={styles.exifGpsText} numberOfLines={2}>
                        {p.exifGps
                          ? `照片內嵌位置：${p.exifGps.latitude.toFixed(5)}, ${p.exifGps.longitude.toFixed(5)}`
                          : '使用當前位置'}
                      </Text>
                    </View>
                    {/* 左上角紅色X刪除按鈕 */}
                    <Pressable 
                      style={styles.photoDeleteBtn} 
                      onPress={() => removePhoto(p.id)} 
                      hitSlop={10}
                    >
                      <View style={styles.deleteCircle}>
                        <Ionicons name="close" size={16} color="#FFFFFF" />
                      </View>
                    </Pressable>
                  </View>
                ))}
                
                {/* 顯示添加按鈕（填滿剩餘位置） */}
                {Array.from({ length: maxPhotos - photos.length }).map((_, index) => (
                  <Pressable 
                    key={`add-${index}`} 
                    style={styles.addPhotoItem}
                    onPress={() => {
                      // 顯示底部圖形菜單
                      setShowPhotoSourceModal(true);
                    }}
                  >
                    <Ionicons name="add" size={32} color="#9CA3AF" />
                  </Pressable>
                ))}
              </View>
            </View>
            
            {/* 相片要求按鈕 */}
            <View style={styles.photoRequirementsButtonContainer}>
              <Pressable 
                style={styles.photoRequirementsButton}
                onPress={() => setShowPhotoRequirements(true)}
              >
                <Ionicons name="information-circle-outline" size={20} color="#065F46" />
                <Text style={styles.photoRequirementsButtonText}>相片要求</Text>
              </Pressable>
            </View>
            
            {/* 確定提交按鈕 */}
            {photos.length > 0 && (
              <View style={styles.submitButtonContainer}>
                <Pressable 
                  style={[styles.submitBtn, isUploading && styles.disabled]} 
                  onPress={onSubmitPress} 
                  disabled={isUploading}
                >
                  <Text style={styles.submitText}>
                    {isUploading ? '上傳中...' : '確定提交'}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>

      {/* 魚塘選擇 modal */}
      <Modal visible={pondModalVisible} animationType="slide" onRequestClose={() => setPondModalVisible(false)}>
        <StatusBar barStyle="dark-content" />
        <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>選擇魚塘</Text>
            <Pressable onPress={() => setPondModalVisible(false)}>
              <Text style={styles.modalClose}>關閉</Text>
            </Pressable>
          </View>

          <FlatList
            data={userPonds}
            keyExtractor={(p) => p.id}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            renderItem={({ item }) => {
              const active = item.id === selectedPondUuid;
              return (
                <Pressable
                  style={[styles.modalItem, active && styles.modalItemActive]}
                  onPress={() => {
                    const pondId = item.id;
                    const pondName = item.pond_id || item.id;
                    
                    // 先立即注入 JavaScript（Modal 還開著，WebView 還活躍）
                    if (webRef.current) {
                      webRef.current.injectJavaScript(`
                        (function() {
                          var pondId = '${pondId}';
                          var pondName = '${pondName}';
                          var attempts = 0;
                          var maxAttempts = 20;
                          
                          function tryUpdateMap() {
                            attempts++;
                            
                            try {
                              // 使用 window.map 訪問全局 map 對象
                              if (typeof window.map === 'undefined' || !window.map || typeof window.map.getZoom !== 'function') {
                                if (attempts < maxAttempts) {
                                  if (attempts === 1 || attempts % 5 === 0) {
                                    addLog('⏳ 等待地圖初始化... (嘗試 ' + attempts + '/' + maxAttempts + ')');
                                  }
                                  setTimeout(tryUpdateMap, 150);
                                  return;
                                } else {
                                  addLog('❌ 地圖初始化超時 (嘗試了 ' + attempts + ' 次)');
                                  addLog('Debug: window.map=' + (typeof window.map));
                                  addLog('Debug: window.markers=' + (typeof window.markers));
                                  addLog('Debug: window.pondLocations=' + (typeof window.pondLocations));
                                  return;
                                }
                              }
                              
                              var map = window.map;
                              var markers = window.markers;
                              var pondLocations = window.pondLocations;
                              
                              addLog('✓ 地圖已就緒 (第 ' + attempts + ' 次嘗試)');
                              addLog('🔄 收到下拉選擇指令: ' + pondName);
                              addLog('當前地圖zoom: ' + map.getZoom());
                              
                              // 1. 更新標記顏色
                              if (window.updateMarkerColors) {
                                addLog('調用 updateMarkerColors("' + pondId + '")');
                                window.updateMarkerColors(pondId);
                                addLog('✓ 顏色更新完成');
                              } else {
                                addLog('⚠️ updateMarkerColors 未定義');
                              }
                              
                              // 2. 移動地圖到該魚塘
                              if (pondLocations[pondId]) {
                                var loc = pondLocations[pondId];
                                addLog('目標位置: ' + loc.lat.toFixed(6) + ', ' + loc.lng.toFixed(6));
                                
                                if (typeof map.flyTo === 'function') {
                                  map.flyTo([loc.lat, loc.lng], 17, {
                                    animate: true,
                                    duration: 1
                                  });
                                  addLog('✓ 已調用 flyTo 居中到 ' + pondName);
                                  
                                  // 驗證地圖是否移動
                                  setTimeout(function() {
                                    if (map && typeof map.getCenter === 'function') {
                                      var newCenter = map.getCenter();
                                      addLog('移動後地圖中心: ' + newCenter.lat.toFixed(6) + ', ' + newCenter.lng.toFixed(6));
                                    }
                                  }, 1200);
                                } else {
                                  addLog('❌ map.flyTo 不可用');
                                }
                              } else {
                                addLog('⚠️ 找不到魚塘位置: ' + pondId);
                                addLog('可用位置IDs: ' + Object.keys(pondLocations).join(', '));
                              }
                            } catch(err) {
                              addLog('❌ 錯誤: ' + err.message);
                              console.error(err);
                            }
                          }
                          
                          // 立即開始第一次嘗試
                          addLog('🚀 開始重試機制...');
                          tryUpdateMap();
                        })();
                        true;
                      `);
                    }
                    
                    // 然後再更新狀態和關閉 Modal
                    setSelectedPondUuid(pondId);
                    setSelectedPeriod(null);
                    setCurrentPage(1); // 重置到第1頁
                    setPondModalVisible(false);
                  }}
                >
                  <Text style={[styles.modalItemTitle, active && styles.modalItemTitleActive]}>{item.pond_id}</Text>
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>

      {/* 期別選擇 modal */}
      <Modal visible={periodModalVisible} animationType="slide" onRequestClose={() => setPeriodModalVisible(false)}>
        <StatusBar barStyle="dark-content" />
        <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>選擇期別</Text>
            <Pressable onPress={() => setPeriodModalVisible(false)}>
              <Text style={styles.modalClose}>關閉</Text>
            </Pressable>
          </View>

          <FlatList
            data={availablePeriods}
            keyExtractor={(p) => p.id}
            ListEmptyComponent={() => (
              <View style={{ padding: 16 }}>
                <Text style={styles.empty}>所有階段已提交</Text>
        </View>
      )}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            renderItem={({ item }) => {
              const active = item.id === selectedPeriod;
              return (
                <Pressable
                  style={[styles.modalItem, active && styles.modalItemActive]}
                  onPress={() => {
                    setSelectedPeriod(item.id);
                    setPeriodModalVisible(false);
                  }}
                >
                  <Text style={[styles.modalItemTitle, active && styles.modalItemTitleActive]}>{item.label}</Text>
                  <Text style={[styles.modalItemMeta, active && styles.modalItemMetaActive]}>{item.id}</Text>
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>

      {/* 免責聲明 */}
      <Modal visible={showDisclaimer} transparent animationType="fade" onRequestClose={() => setShowDisclaimer(false)}>
        <View style={styles.dialogMask}>
          <View style={styles.dialogCard}>
            <Text style={styles.dialogTitle}>免責聲明</Text>
            <ScrollView style={{ maxHeight: 220 }} contentContainerStyle={{ paddingVertical: 6 }}>
              <Text style={styles.dialogText}>本人確認所提交的相片為本人親自拍攝，相片內容真實反映魚塘/雀鳥的實際情況。</Text>
              <Text style={styles.dialogText}>本人明白如提交虛假或誤導性資料，可能會影響補貼申請資格，並可能需要承擔相關法律責任。</Text>
              <Text style={styles.dialogText}>本人同意香港濕地保育協會可使用所提交的相片作研究及推廣用途。</Text>
              <Text style={styles.dialogText}>本人確認已閱讀並同意上述條款。</Text>
            </ScrollView>

            <View style={styles.dialogActions}>
              <Pressable style={[styles.btn, styles.btnSecondary]} onPress={() => setShowDisclaimer(false)}>
                <Text style={[styles.btnText, styles.btnSecondaryText]}>取消</Text>
              </Pressable>
              <Pressable style={styles.btn} onPress={() => void doSubmit()}>
                <Text style={styles.btnText}>確認並提交</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 相片要求 */}
      <Modal visible={showPhotoRequirements} transparent animationType="fade" onRequestClose={() => setShowPhotoRequirements(false)}>
        <View style={styles.dialogMask}>
          <View style={styles.dialogCard}>
            <Text style={styles.dialogTitle}>雀鳥相片要求</Text>
            <ScrollView style={{ maxHeight: 500 }} contentContainerStyle={{ paddingVertical: 6 }}>
              <Text style={styles.requirementSectionTitle}>拍攝雀鳥使用魚塘相片：</Text>
              <Text style={styles.dialogText}>監察管理工作成效 — 在協議實施地點拍攝雀鳥使用魚塘的相片。</Text>

              <Text style={styles.requirementSectionTitle}>拍攝雀鳥使用該魚塘的照片</Text>
              <Text style={styles.dialogText}>相片須能夠清晰顯示雀鳥使用該魚塘</Text>

              <Text style={[styles.requirementSectionTitle, { marginTop: 8, color: '#059669' }]}>雀鳥相片示例（符合要求）：</Text>
              <Image source={birdRequirement01} style={styles.exampleImage} resizeMode="contain" />
              <Image source={birdRequirement02} style={styles.exampleImage} resizeMode="contain" />
              <Image source={birdRequirement03} style={styles.exampleImage} resizeMode="contain" />

              <Text style={[styles.requirementSectionTitle, { color: '#DC2626' }]}>不合符要求之相片：</Text>
              <Text style={styles.dialogTextIndent}>• 相片無法顯示雀鳥使用該魚塘</Text>
              <Image source={birdRequirement04} style={styles.exampleImage} resizeMode="contain" />
              <Text style={styles.dialogTextIndent}>• 相片模糊不清</Text>
              <Image source={birdRequirement05} style={styles.exampleImage} resizeMode="contain" />

              <Text style={styles.requirementSectionTitle}>備註：</Text>
              <Text style={styles.dialogText}>切勿過於接近雀鳥，以免驚擾雀鳥</Text>
            </ScrollView>

            <View style={styles.dialogActions}>
              <Pressable style={styles.btn} onPress={() => setShowPhotoRequirements(false)}>
                <Text style={styles.btnText}>知道了</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 上傳中覆蓋層 */}
      {isUploading ? (
        <View style={styles.uploadMask} pointerEvents="auto">
          <View style={styles.uploadCard}>
            <ActivityIndicator size="large" color="#059669" />
            <Text style={styles.uploadTitle}>上傳中...</Text>
            <Text style={styles.uploadProgress}>
              {uploadProgress.current} / {uploadProgress.total} 張相片
            </Text>
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBar, { width: `${uploadProgress.percent}%` }]} />
            </View>
            <Text style={styles.uploadPercent}>{uploadProgress.percent}%</Text>
            <Text style={styles.uploadHint}>請勿關閉 App</Text>
            <Pressable
              style={[styles.cancelUploadButton, isCancelling && styles.disabled]}
              onPress={handleCancelUpload}
              disabled={isCancelling}
            >
              <Text style={styles.cancelUploadText}>
                {isCancelling ? '取消中...' : '取消上載'}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* 相片來源選擇 - 絕對定位底部菜單 */}
      {showPhotoSourceModal && (
        <View style={styles.photoSourceOverlay}>
          <Pressable 
            style={styles.photoSourceBackdrop}
            onPress={() => setShowPhotoSourceModal(false)}
          />
          <View style={styles.photoSourceMenu}>
            <Text style={styles.photoSourceMenuTitle}>選擇相片來源</Text>
            
            <View style={styles.photoSourceOptions}>
              <Pressable 
                style={styles.photoSourceOption}
                onPress={() => {
                  setShowPhotoSourceModal(false);
                  setTimeout(() => openCamera(), 100);
                }}
              >
                <View style={[styles.photoSourceOptionIcon, { backgroundColor: '#2C5F6F' }]}>
                  <Ionicons name="camera" size={28} color="#FFFFFF" />
                </View>
                <Text style={styles.photoSourceOptionText}>拍攝</Text>
              </Pressable>

              <Pressable 
                style={styles.photoSourceOption}
                onPress={() => {
                  setShowPhotoSourceModal(false);
                  setTimeout(() => {
                    openGallery().catch(err => {
                      console.error('📂 打開相冊錯誤:', err);
                    });
                  }, 100);
                }}
              >
                <View style={[styles.photoSourceOptionIcon, { backgroundColor: '#10B981' }]}>
                  <Ionicons name="images" size={28} color="#FFFFFF" />
                </View>
                <Text style={styles.photoSourceOptionText}>從相片庫選擇</Text>
              </Pressable>
            </View>

            <Pressable 
              style={styles.photoSourceMenuCancel}
              onPress={() => setShowPhotoSourceModal(false)}
            >
              <Text style={styles.photoSourceMenuCancelText}>取消</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* 自定義相機 */}
      {showCustomCamera ? (
        <Modal visible={showCustomCamera} animationType="slide">
          <CustomCamera 
            onCapture={handleCameraCapture}
            onComplete={handleCameraComplete}
            onCancel={handleCameraCancel}
            onDelete={handleCameraDelete}
            photos={photos}
            maxPhotos={maxPhotos}
            enablePreview={true}
          />
        </Modal>
      ) : null}

      {/* 正在檢查位置提示 */}
      <Modal visible={isCheckingLocation} animationType="fade" transparent={true}>
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#FFFFFF" />
            <Text style={styles.loadingText}>正在檢查照片位置...</Text>
          </View>
        </View>
      </Modal>

      {/* 相冊選取預覽 */}
      {galleryPreviewPhoto ? (
        <Modal visible={!!galleryPreviewPhoto} animationType="slide" transparent={false}>
          <View style={styles.previewContainer}>
            <StatusBar barStyle="light-content" backgroundColor="#000000" />
            
            {/* 預覽圖片 */}
            <Image source={{ uri: galleryPreviewPhoto.uri }} style={styles.previewImage} />
            
            {/* 頂部控制欄 */}
            <SafeAreaView style={styles.previewTopBar}>
              <Pressable style={styles.previewTopButton} onPress={handleGalleryCancel}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </Pressable>
            </SafeAreaView>

            {/* 底部控制欄 */}
            <SafeAreaView style={styles.previewBottomBar}>
              <View style={styles.previewControls}>
                {/* 取消按鈕 */}
                <Pressable style={styles.previewActionBtn} onPress={handleGalleryCancel}>
                  <Ionicons name="close" size={20} color="#FFFFFF" />
                  <Text style={styles.previewActionText}>取消</Text>
                </Pressable>

                {/* 重選按鈕 */}
                <Pressable style={styles.previewActionBtn} onPress={handleGalleryCancel}>
                  <Ionicons name="refresh" size={22} color="#FFFFFF" />
                  <Text style={styles.previewActionText}>重選</Text>
                </Pressable>

                {/* 確定按鈕 */}
                <Pressable style={styles.previewConfirmButton} onPress={handleGalleryConfirm}>
                  <Ionicons name="checkmark" size={28} color="#FFFFFF" />
                  <Text style={styles.previewConfirmText}>確定</Text>
                </Pressable>
              </View>
            </SafeAreaView>
          </View>
        </Modal>
      ) : null}

      {/* 固定的 Tab Bar */}
      <FixedTabBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#7B8427' },

  // 類型選擇界面
  typeSelectionContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeSelectionTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
    marginTop: 25,
    marginBottom: 48,
    textAlign: 'center',
  },
  typeIconsContainer: {
    alignItems: 'center',
    gap: 24,
    width: '100%',
    maxWidth: 300,
  },
  typeIconButton: {
    alignItems: 'center',
    gap: 3,
    borderRadius: 16,
    padding: 12,
  },
  typeIconLabel: {
    fontSize: 16,
    fontWeight: '900',
    color: '#DC2626',
    marginTop: 10,
  },

  // 標題區域
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: '#7B8427',
    position: 'relative',
    minHeight: 24,
  },
  backButton: {
    position: 'absolute',
    left: 16,
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    zIndex: 1,
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

  block: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12 },
  blockHalfWidth: { 
    paddingHorizontal: 16, 
    paddingTop: 6, 
    paddingBottom: 12,
    width: '50%',
    alignSelf: 'center',
  },
  label: { fontSize: 13, fontWeight: '900', color: '#111827', marginBottom: 8 },
  pageTitleLeft: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 8,
    lineHeight: 24,
  },
  helper: { marginTop: 8, color: '#6b7280', fontSize: 12, lineHeight: 16 },

  row: { flexDirection: 'row', gap: 10, marginTop: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  badgeWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeWarnText: { color: '#92400E', fontWeight: '900', fontSize: 12 },

  infoCard: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    padding: 12,
    backgroundColor: '#F9FAFB',
    marginBottom: 12,
  },
  infoCardLabel: { color: '#6b7280', fontSize: 12 },
  infoCardValue: { marginTop: 6, fontSize: 16, fontWeight: '900', color: '#111827' },
  
  // 魚塘編號卡片（米色背景）
  pondIdCard: {
    backgroundColor: '#F5F1E8',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    marginBottom: 20,
    alignItems: 'center',
  },
  pondIdCardText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  
  // 流程圖容器
  flowChartContainer: {
    marginTop: 20,
    paddingHorizontal: 20,
  },
  flowTopRow: {
    alignItems: 'center',
    marginBottom: 15,
    width: '50%',
    alignSelf: 'center',
  },
  flowLines: {
    height: 50,
    position: 'relative',
    marginBottom: 15,
  },
  flowLineLeft: {
    position: 'absolute',
    left: '15%',
    top: 0,
    width: 3,
    height: 50,
    backgroundColor: '#004667',
    transform: [{ rotate: '-30deg' }],
  },
  flowLineRight: {
    position: 'absolute',
    right: '15%',
    top: 0,
    width: 3,
    height: 50,
    backgroundColor: '#004667',
    transform: [{ rotate: '30deg' }],
  },
  flowBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'stretch',
  },
  flowColumn: {
    flex: 1,
    alignItems: 'center',
  },
  flowDivider: {
    width: 2,
    backgroundColor: '#000000',
    alignSelf: 'stretch',
    marginHorizontal: 10,
  },
  flowButton: {
    width: '100%',
    paddingVertical: 18,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 110,
  },
  flowButtonSelected: {
    borderColor: '#EF4444',
    borderWidth: 3,
  },
  flowButtonSubmitted: {
    opacity: 0.6,
  },
  flowButtonText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    lineHeight: 26,
  },
  flowButtonTextSubmitted: {
    color: '#6B7280',
  },
  flowButtonGap: {
    height: 15,
  },

  // 雀鳥階段按鈕（簡單三按鈕）
  birdPeriodsContainer: {
    gap: 12,
    marginTop: 16,
  },
  birdPeriodButton: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  birdPeriodButtonSelected: {
    borderColor: '#EF4444',
    borderWidth: 3,
  },
  birdPeriodButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  birdPeriodButtonTextSelected: {
    fontWeight: '900',
  },

  selectCard: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    padding: 12,
    backgroundColor: '#fff',
  },
  selectCardLabel: { color: '#6b7280', fontSize: 12 },
  selectCardValue: { marginTop: 6, fontSize: 14, fontWeight: '900', color: '#111827' },

  periodButtonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  periodButtonWrapper: {
    width: '48%',
    position: 'relative',
  },
  periodButtonWrapperLarge: {
    width: '100%',
  },
  periodButton: {
    width: '100%',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    minHeight: 80,
    // backgroundColor 由動態設置控制
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodButtonDivider: {
    position: 'absolute',
    right: -6,
    top: '50%',
    width: 2,
    height: 50,
    backgroundColor: '#000000',
    marginTop: -25,
  },
  periodButtonLarge: {
    paddingVertical: 20,
  },
  periodButtonSelected: {
    borderColor: '#EF4444',
    borderWidth: 3,
    // backgroundColor 由動態設置控制
  },
  periodButtonSubmitted: {
    borderColor: '#D1D5DB',
    backgroundColor: '#F3F4F6',
    opacity: 0.6,
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    lineHeight: 20,
  },
  periodButtonTextLarge: {
    fontSize: 18,
    fontWeight: '900',
  },
  periodButtonTextSelected: {
    color: '#065F46',
    fontWeight: '900',
  },
  periodButtonTextSubmitted: {
    color: '#9CA3AF',
  },

  mapWrap: { height: 240, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#E5E7EB' },
  map: { flex: 1 },
  mapSelectedPill: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    backgroundColor: 'rgba(52,211,153,0.85)',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mapSelectedText: { color: '#065F46', fontWeight: '900' },

  // GPS 信息卡片
  gpsInfoCard: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  gpsInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  gpsInfoLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#374151',
  },
  gpsReminderBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    gap: 6,
  },
  gpsReminderText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E40AF',
    flex: 1,
    lineHeight: 17,
  },
  gpsInfoCoord: {
    fontSize: 14,
    fontWeight: '900',
    color: '#059669',
    marginLeft: 22,
  },
  gpsWarningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginLeft: 22,
  },
  gpsWarningText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
  },
  gpsSettingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  gpsSettingText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#111827',
  },

  coord: { marginTop: 2, fontSize: 15, fontWeight: '900', color: '#111827' },

  photoSection: {
    width: '100%',
    paddingTop: 6,
    paddingBottom: 12,
  },
  photoHeader: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  
  // 資料欄容器和樣式
  infoCardsContainer: {
    flexDirection: 'column',
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  infoCardFull: {
    width: '100%',
    backgroundColor: '#F5F1E8',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  // 魚塘水位相片標題區域
  photoTitleSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
    alignItems: 'center',
  },
  photoTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  photoInstruction: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  
  // 大圓形拍攝按鈕
  captureButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
    paddingHorizontal: 16,
    marginBottom: 32,
  },
  largeCaptureBtn: {
    alignItems: 'center',
    gap: 12,
  },
  captureIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4A7C8C',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  captureBtnLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  
  // 相片要求區域
  photoRequirementSection: {
    paddingHorizontal: 16,
  },
  photoRequirementTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  photoGrid: { 
    flexDirection: 'column', 
    gap: 10,
    paddingHorizontal: 16,
  },
  photoCell: { width: '100%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: '#F3F4F6' },
  photo: { width: '100%', height: '100%' },
  photoRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(52,211,153,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPin: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(220,38,38,0.85)',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  
  // 相片網格容器（3列佈局）
  photoGridContainer: {
    paddingHorizontal: 16,
    marginTop: 20,
  },
  photoGridThreeColumn: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  photoItemWithBorder: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    position: 'relative',
    marginBottom: 12,
  },
  photoThumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  exifGpsBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  exifGpsText: {
    fontSize: 9,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  photoDeleteBtn: {
    position: 'absolute',
    top: 4,
    left: 4,
  },
  deleteCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addPhotoItem: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },

  addCell: {
    width: '100%',
    aspectRatio: 3,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  addRow: { flexDirection: 'row', gap: 10 },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  addHint: { color: '#6b7280', fontSize: 12, fontWeight: '800' },

  submitBtn: {
    backgroundColor: '#4A7C8C',
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
  },
  submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  submitButtonContainer: {
    paddingHorizontal: 16,
    marginTop: 24,
    marginBottom: 24,
  },

  // 淚滴標籤
  tagsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  tearDropTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  tearDropTagRed: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  tearDropTagBlue: {
    backgroundColor: '#DBEAFE',
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  tagLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  tagLabelRed: {
    color: '#DC2626',
  },
  tagLabelBlue: {
    color: '#2563EB',
  },
  tagValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  tagValueRed: {
    color: '#991B1B',
  },
  tagValueBlue: {
    color: '#1E40AF',
  },

  // 分頁按鈕
  nextPageBtn: {
    backgroundColor: 'transparent',
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  nextPageText: { color: '#111827', fontSize: 16, fontWeight: '900' },
  
  prevPageBtn: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  prevPageText: { color: '#111827', fontSize: 16, fontWeight: '900' },

  btn: { flex: 1, backgroundColor: '#34D399', paddingVertical: 12, borderRadius: 999, alignItems: 'center' },
  btnText: { color: '#065F46', fontSize: 14, fontWeight: '900' },
  btnSecondary: { backgroundColor: '#F3F4F6' },
  btnSecondaryText: { color: '#111827' },
  disabled: { opacity: 0.5 },

  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
  },

  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: { fontSize: 16, fontWeight: '900' },
  modalClose: { color: '#111827', fontWeight: '900' },
  modalItem: { paddingHorizontal: 16, paddingVertical: 12 },
  modalItemActive: { backgroundColor: '#34D399' },
  modalItemTitle: { fontSize: 15, fontWeight: '900', color: '#111827' },
  modalItemTitleActive: { color: '#065F46' },
  modalItemMeta: { marginTop: 6, color: '#6b7280', fontSize: 12 },
  modalItemMetaActive: { color: '#E5E7EB' },
  sep: { height: 1, backgroundColor: '#F3F4F6' },
  empty: { color: '#6b7280', fontWeight: '800' },

  dialogMask: { flex: 1, backgroundColor: 'rgba(17,24,39,0.55)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  dialogCard: { width: '100%', borderRadius: 16, backgroundColor: '#fff', padding: 14 },
  dialogTitle: { fontSize: 16, fontWeight: '900', color: '#111827', marginBottom: 6 },
  dialogText: { color: '#374151', fontSize: 13, lineHeight: 18, marginTop: 8 },
  dialogTextIndent: { color: '#374151', fontSize: 13, lineHeight: 20, marginTop: 4, paddingLeft: 8 },
  exampleImage: { width: '100%', height: 200, marginTop: 8, marginBottom: 8, borderRadius: 8 },
  requirementSectionTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginTop: 16, marginBottom: 4 },
  dialogActions: { flexDirection: 'row', gap: 10, marginTop: 12 },

  // 相片要求按鈕
  photoRequirementsButtonContainer: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  photoRequirementsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
  },
  photoRequirementsButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#065F46',
  },

  uploadMask: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(52,211,153,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, alignItems: 'center', width: 220 },
  uploadTitle: { marginTop: 10, fontWeight: '900', color: '#111827', fontSize: 16 },
  uploadProgress: { marginTop: 8, color: '#374151', fontSize: 14, fontWeight: '600' },
  uploadPercent: { marginTop: 4, color: '#059669', fontSize: 13, fontWeight: '700' },
  progressBarContainer: {
    width: 200,
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#059669',
    borderRadius: 4,
  },
  uploadHint: { marginTop: 12, color: '#6b7280', fontSize: 12 },
  cancelUploadButton: {
    marginTop: 16,
    backgroundColor: '#EF4444',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelUploadText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // 相片來源選擇 Modal
  photoSourceMask: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  photoSourceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  photoSourceTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 32,
  },
  photoSourceButtonsContainer: {
    flexDirection: 'row',
    gap: 32,
    marginBottom: 24,
  },
  photoSourceButton: {
    alignItems: 'center',
    gap: 12,
  },
  photoSourceIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#2C5F6F',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  photoSourceButtonLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  photoSourceCancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  photoSourceCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },

  // 底部菜單樣式
  photoSourceOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  photoSourceBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  photoSourceMenu: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
  },
  photoSourceMenuTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 20,
  },
  photoSourceOptions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
    marginBottom: 20,
  },
  photoSourceOption: {
    alignItems: 'center',
    gap: 8,
  },
  photoSourceOptionIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  photoSourceOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  photoSourceMenuCancel: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  photoSourceMenuCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },

  // 相冊預覽界面
  previewContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  previewImage: {
    flex: 1,
    resizeMode: 'contain',
    backgroundColor: '#000000',
  },
  previewTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  previewTopButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingVertical: 30,
  },
  previewControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 40,
  },
  previewActionBtn: {
    alignItems: 'center',
    padding: 12,
  },
  previewActionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  previewConfirmButton: {
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(0, 153, 153, 0.9)',
    borderRadius: 12,
    minWidth: 100,
  },
  previewConfirmText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },

  // Loading 提示樣式
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    minWidth: 160,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
  },
});
