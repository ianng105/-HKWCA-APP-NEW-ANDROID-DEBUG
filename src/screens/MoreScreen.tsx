import React, { useMemo, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  Platform,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "../contexts/AuthContext";
import type { RootStackParamList } from "../navigation/AppNavigator";

// 關於本計劃圖片
const aboutProjectImage = require('../../assets/About_project_compressed.jpg');
const projectNameImage = require('../../assets/Project_name_compressed.png');
const hkwcaLogo = require('../../assets/HKWCA_Logo_compressed.png');
const combinedLogo = require('../../assets/CCO_CCFS_combined.png');
// 香港濕地保育協會圖片
const aboutHKWCAImage = require('../../assets/About_HKWCA_compressed.jpg');
const hkwcaLogoNew = require('../../assets/HKWCA_Logo_v2_compressed.png');

type MenuItem = {
  label: string;
  onPress: () => void;
};

export function MoreScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { user, userPonds, signOut } = useAuth();
  const [accountOpen, setAccountOpen] = useState(false);
  const [pondsOpen, setPondsOpen] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showHKWCAModal, setShowHKWCAModal] = useState(false);

  const menuItems: MenuItem[] = useMemo(
    () => [
      {
        label: "關於本計劃",
        onPress: () => setShowAboutModal(true),
      },
      {
        label: "教學",
        onPress: () =>
          Alert.alert("提示", "即將推出"),
      },
      {
        label: "香港濕地保育協會",
        onPress: () => setShowHKWCAModal(true),
      },
    ],
    [],
  );

  const onSignOut = async () => {
    Alert.alert("登出", "確定要登出嗎？", [
      { text: "取消", style: "cancel" },
      {
        text: "登出",
        style: "destructive",
        onPress: () => {
          void signOut();
        },
      },
    ]);
  };

  const onSignIn = () => {
    navigation.navigate("Auth");
  };

  const statusBarHeight =
    Platform.OS === "android" ? StatusBar.currentHeight || 0 : insets.top;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: "rgba(0, 153, 153, 1)" }]}
      contentContainerStyle={{ paddingBottom: 24, paddingTop: 0 }}
    >
      <View style={[styles.header, { paddingTop: statusBarHeight + 16 }]}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>更多</Text>
        </View>
      </View>

      <View style={{ flex: 1, backgroundColor: "#fff" }}>
        <View style={styles.card}>
          <Pressable
            style={[styles.cardHeader, accountOpen && styles.cardHeaderOpen]}
            onPress={() => setAccountOpen((v) => !v)}
          >
            <Text style={styles.cardTitle}>帳戶資料</Text>
            <Ionicons
              name={accountOpen ? "chevron-up" : "chevron-down"}
              size={20}
              color="#111827"
            />
          </Pressable>

          {accountOpen ? (
            <>
              <View style={styles.kvRow}>
                <Text style={styles.kvKey}>用戶編號</Text>
                <Text style={styles.kvVal}>{user?.owner_id || "未設定"}</Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.kvKey}>用戶名稱</Text>
                <Text style={styles.kvVal}>{user?.name || "未設定"}</Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.kvKey}>項目期數</Text>
                <Text style={styles.kvVal}>{user?.project_year_label || "未設定"}</Text>
              </View>

              {userPonds.length > 0 ? (
                <View style={{ marginTop: 10 }}>
                  <Pressable
                    style={styles.collapseHeader}
                    onPress={() => setPondsOpen((v) => !v)}
                  >
                    <Text style={styles.collapseTitle}>
                      我的魚塘（{userPonds.length}）
                    </Text>
                    <Text style={styles.collapseArrow}>
                      {pondsOpen ? "收起" : "展開"}
                    </Text>
                  </Pressable>

                  {pondsOpen ? (
                    <View style={styles.pondWrap}>
                      {userPonds.map((p) => (
                        <View key={p.id} style={styles.pondChip}>
                          <Text style={styles.pondChipText}>{p.pond_id}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </>
          ) : null}
        </View>

        <View style={{ marginTop: 12, gap: 10, paddingHorizontal: 16 }}>
          {menuItems.map((item) => (
            <Pressable
              key={item.label}
              style={styles.menuItem}
              onPress={item.onPress}
            >
              <Text style={styles.menuText}>{item.label}</Text>
              <Text style={styles.menuArrow}>›</Text>
            </Pressable>
          ))}
        </View>

        <View
          style={{ marginTop: 16, paddingHorizontal: 16, paddingBottom: 16 }}
        >
          <Pressable
            style={user ? styles.signOutBtn : styles.signInBtn}
            onPress={user ? onSignOut : onSignIn}
          >
            <Text style={styles.signOutText}>{user ? "登出" : "登入"}</Text>
          </Pressable>
        </View>
      </View>

      {/* 關於本計劃 Modal */}
      <Modal
        visible={showAboutModal}
        animationType="slide"
        onRequestClose={() => setShowAboutModal(false)}
      >
        <SafeAreaView
          style={[styles.modalContainer, { paddingTop: insets.top }]}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>關於本計劃</Text>
            <Pressable onPress={() => setShowAboutModal(false)}>
              <Text style={styles.modalClose}>關閉</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.modalContent}
            contentContainerStyle={{ padding: 16 }}
          >
            {/* 計劃名稱圖片 */}
            <Image
              source={projectNameImage}
              style={styles.projectNameImage}
              resizeMode="contain"
            />

            {/* 計劃活動圖片 */}
            <Image
              source={aboutProjectImage}
              style={styles.aboutProjectImage}
              resizeMode="cover"
            />

            <Text style={styles.aboutSectionTitle}>計劃簡介。</Text>
            <Text style={styles.aboutText}>
              計劃融合積極魚塘生境管理、科學監測與研究、公眾參與，夥拍后海灣米埔、大生圍及甩洲養魚戶，共同保育本地魚塘生態和文化，推廣本地漁業。
            </Text>

            <Text style={styles.aboutSectionTitle}>目標</Text>
            <Text style={styles.aboutListItem}>
              • 夥拍養魚戶，於魚塘進行生境管理措施，為水鳥提供覓食和棲息的環境，以增強魚塘生態價值
            </Text>
            <Text style={styles.aboutListItem}>
              • 進行生態及環境調查，提供水鳥及其生境的數據，監測魚塘狀況，以支持可持續生境管理
            </Text>
            <Text style={styles.aboutListItem}>
              • 與養魚戶合作，向公眾宣傳本地魚塘文化及生態價值，促進生態保育與養魚的和諧共存
            </Text>
            <Text style={styles.aboutListItem}>
              • 提升公眾對濕地保育的認識及參與
            </Text>

            <Text style={styles.aboutFooter}>
              *計劃由香港濕地保育協會主辧，鄉郊保育辦公室及鄉郊保育資助計劃資助
            </Text>

            {/* Logo 區域 */}
            <View style={styles.logoSection}>
              <Text style={styles.logoLabel}>資助：</Text>
              <View style={styles.logoSingleRow}>
                <Image source={combinedLogo} style={styles.orgLogoFull} resizeMode="contain" />
              </View>

              <Text style={[styles.logoLabel, { marginTop: 16 }]}>主辦：</Text>
              <View style={styles.logoSingleRow}>
                <Image source={hkwcaLogo} style={styles.orgLogoFull} resizeMode="contain" />
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* 香港濕地保育協會 Modal */}
      <Modal
        visible={showHKWCAModal}
        animationType="slide"
        onRequestClose={() => setShowHKWCAModal(false)}
      >
        <SafeAreaView
          style={[styles.modalContainer, { paddingTop: insets.top }]}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>香港濕地保育協會</Text>
            <Pressable onPress={() => setShowHKWCAModal(false)}>
              <Text style={styles.modalClose}>關閉</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.modalContent}
            contentContainerStyle={{ padding: 16 }}
          >
            {/* Logo 圖片 */}
            <Image
              source={hkwcaLogoNew}
              style={styles.hkwcaLogoImage}
              resizeMode="contain"
            />

            {/* 關於 HKWCA 圖片 */}
            <Image
              source={aboutHKWCAImage}
              style={styles.aboutHKWCAImage}
              resizeMode="cover"
            />

            <Text style={styles.aboutTitle}>香港濕地保育協會</Text>
            <Text style={styles.aboutSubtitle}>
              Hong Kong Wetlands Conservation Association, HKWCA
            </Text>

            <Text style={styles.aboutText}>
              為本地非政府機構，成立於2018年，旨在促進濕地和自然保育。另外，本會亦積極推動生態環境教育及分享國際和本地濕地管理的經驗。
            </Text>

            <Text style={styles.aboutSectionTitle}>主要工作</Text>
            <Text style={styles.aboutListItem}>
              • 透過論壇、工作坊、交流平台等，促進國際和本地濕地保育和管理的經驗交流。
            </Text>
            <Text style={styles.aboutListItem}>
              • 教育項目：涵蓋多元化方向，包括：學習、欣賞、行動、參與和溝通等，促進社區濕地保育。鼓勵公眾參與、滙集社區力量。共同推動保育工作。
            </Text>
            <Text style={styles.aboutListItem}>
              • 建立網絡聯係：透過海外考察和交流，與其他地方的濕地保護區和中心建立聯繫。
            </Text>
            <Text style={styles.aboutListItem}>
              • 倡議本地自然及濕地保護政策和策略。
            </Text>

            <Text style={styles.aboutSectionTitle}>香港濕地保育協會：</Text>
            <Text style={styles.aboutListItem}>
              • 為根據香港《稅務條例》第88條獲免稅繳稅的慈善機構
            </Text>
            <Text style={styles.aboutListItem}>
              • 國際濕地聯盟 (WLI) 成員 (國際濕地網絡 (WLI) 是全球濕地教育中心網絡並由拉姆薩爾公約認可)
            </Text>

            <Text style={styles.aboutSectionTitle}>網頁</Text>
            <Pressable
              onPress={() => {
                void Linking.openURL("https://www.hkwca.org.hk/");
              }}
            >
              <Text style={styles.linkText}>www.hkwca.org.hk</Text>
            </Pressable>

            <Text style={styles.aboutSectionTitle}>聯絡我們</Text>
            <Text style={styles.aboutText}>電話：5541 1429</Text>
            <Pressable
              onPress={() => {
                void Linking.openURL("mailto:info@hkwca.org.hk");
              }}
            >
              <Text style={styles.linkText}>電郵：info@hkwca.org.hk</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: "rgba(0, 153, 153, 1)",
    position: "relative",
    minHeight: 24,
  },
  backButton: {
    position: "absolute",
    left: 16,
    alignItems: "center",
    justifyContent: "center",
    width: 24,
    height: 24,
    marginTop: 40,
    zIndex: 1,
  },
  titleContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#FFFFFF",
    textAlign: "center",
    lineHeight: 24,
  },

  card: {
    marginTop: 12,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    padding: 14,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardHeaderOpen: {
    marginBottom: 10,
  },
  cardTitle: { fontSize: 14, fontWeight: "900", color: "#111827" },
  kvRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  kvKey: { color: "#6b7280" },
  kvVal: {
    color: "#111827",
    fontWeight: "900",
    maxWidth: "65%",
    textAlign: "right",
  },

  collapseHeader: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  collapseTitle: { color: "#6b7280", fontSize: 12, fontWeight: "900" },
  collapseArrow: { color: "#111827", fontWeight: "900" },

  pondWrap: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pondChip: {
    backgroundColor: "#34D399",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  pondChipText: { color: "#065F46", fontWeight: "900", fontSize: 12 },

  menuItem: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  menuText: { fontWeight: "900", color: "#111827" },
  menuArrow: { color: "#9CA3AF", fontSize: 18, fontWeight: "900" },

  signOutBtn: {
    backgroundColor: "#EF4444",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  signInBtn: {
    backgroundColor: "#059669",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  signOutText: { color: "#fff", fontSize: 16, fontWeight: "900" },

  modalContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  modalHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
  },
  modalClose: {
    color: "#059669",
    fontWeight: "700",
    fontSize: 16,
  },
  modalContent: {
    flex: 1,
  },
  aboutTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 16,
    lineHeight: 28,
  },
  aboutText: {
    fontSize: 15,
    color: "#374151",
    lineHeight: 24,
    marginBottom: 20,
  },
  aboutSectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginTop: 8,
    marginBottom: 12,
  },
  aboutListItem: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 22,
    marginBottom: 8,
    paddingLeft: 12,
    textIndent: -12,
  },
  aboutFooter: {
    fontSize: 13,
    color: "#6B7280",
    fontStyle: "italic",
    marginTop: 24,
    marginBottom: 20,
    lineHeight: 20,
  },
  aboutLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginTop: 12,
  },
  aboutSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 16,
    fontStyle: "italic",
  },
  linkText: {
    fontSize: 15,
    color: "#059669",
    textDecorationLine: "underline",
    marginBottom: 8,
  },
  // 關於本計劃圖片樣式
  projectNameImage: {
    width: '100%',
    height: 60,
    marginBottom: 16,
  },
  aboutProjectImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 16,
  },
  // 香港濕地保育協會圖片樣式
  hkwcaLogoImage: {
    width: '100%',
    height: 80,
    marginBottom: 16,
  },
  aboutHKWCAImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 16,
  },
  logoSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  logoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  logoSingleRow: {
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  logoCombinedRow: {
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: 16,
  },
  orgLogoFull: {
    width: 250,
    height: 100,
  },
  orgLogoHalf: {
    width: 120,
    height: 80,
  },
});
