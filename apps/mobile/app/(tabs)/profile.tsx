import { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { connectWallet } from "../../lib/wallet";
import {
  fetchExperimentsByBuilder,
  lamportsToSol,
  truncateAddress,
  type ParsedExptConfig,
} from "../../lib/api";
import { colors, spacing, radius, fonts } from "../../lib/theme";

export default function ProfileScreen() {
  const router = useRouter();
  const [wallet, setWallet] = useState<string | null>(null);
  const [experiments, setExperiments] = useState<ParsedExptConfig[]>([]);
  const [loading, setLoading] = useState(false);

  const handleConnect = useCallback(async () => {
    setLoading(true);
    try {
      const pubkey = await connectWallet();
      if (pubkey) {
        const walletAddr = pubkey.toBase58();
        setWallet(walletAddr);
        const expts = await fetchExperimentsByBuilder(walletAddr);
        setExperiments(expts);
      } else {
        Alert.alert("Connection Failed", "Could not connect to wallet.");
      }
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDisconnect = () => {
    setWallet(null);
    setExperiments([]);
  };

  // ── Not connected ─────────────────────────────────────────────
  if (!wallet) {
    return (
      <View style={styles.center}>
        <Text style={styles.emoji}>👤</Text>
        <Text style={styles.title}>Builder Profile</Text>
        <Text style={styles.subtitle}>
          Connect your Solana wallet to view your experiments
        </Text>
        <TouchableOpacity
          style={styles.connectBtn}
          onPress={handleConnect}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.connectBtnText}>Connect Wallet</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  // ── Connected ─────────────────────────────────────────────────
  const totalTreasury = experiments.reduce(
    (sum, e) => sum + lamportsToSol(e.totalTreasuryReceived),
    0
  );
  const totalClaimed = experiments.reduce(
    (sum, e) => sum + lamportsToSol(e.totalClaimedByBuilder),
    0
  );

  const renderExperiment = ({ item }: { item: ParsedExptConfig }) => {
    const passedCount = item.milestones.filter((m) => m.status === 3).length;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => router.push(`/experiment/${item.address.toBase58()}`)}
      >
        <Text style={styles.cardTitle} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>{item.statusLabel}</Text>
          <Text style={styles.cardValue}>
            {passedCount}/{item.milestoneCount} shipped
          </Text>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>Treasury</Text>
          <Text style={styles.cardValue}>
            {lamportsToSol(item.totalTreasuryReceived).toFixed(2)} SOL
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Profile header */}
      <View style={styles.profileHeader}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>
            {wallet.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>Builder</Text>
          <Text style={styles.profileWallet}>
            {truncateAddress(wallet)}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.disconnectBtn}
          onPress={handleDisconnect}
        >
          <Text style={styles.disconnectText}>Disconnect</Text>
        </TouchableOpacity>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{experiments.length}</Text>
          <Text style={styles.statLabel}>Experiments</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>
            {totalTreasury.toFixed(2)}
          </Text>
          <Text style={styles.statLabel}>SOL Raised</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>
            {totalClaimed.toFixed(2)}
          </Text>
          <Text style={styles.statLabel}>SOL Claimed</Text>
        </View>
      </View>

      {/* Experiments list */}
      <Text style={styles.sectionTitle}>Your Experiments</Text>
      <FlatList
        data={experiments}
        keyExtractor={(item) => item.address.toBase58()}
        renderItem={renderExperiment}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No experiments yet</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  emoji: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  title: {
    ...fonts.heading,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...fonts.small,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
  },
  connectBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.foreground,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: radius.md,
    minWidth: 160,
    alignItems: "center",
  },
  connectBtnText: {
    color: colors.background,
    fontWeight: "600",
    fontSize: 14,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    gap: spacing.md,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.foreground,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: colors.background,
    fontWeight: "700",
    fontSize: 16,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    ...fonts.subheading,
  },
  profileWallet: {
    ...fonts.mono,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  disconnectBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  disconnectText: {
    fontSize: 12,
    color: colors.mutedForeground,
    fontWeight: "500",
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statItem: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  statNumber: {
    ...fonts.subheading,
    fontSize: 18,
  },
  statLabel: {
    ...fonts.small,
    fontSize: 10,
    textTransform: "uppercase",
    marginTop: 2,
  },
  sectionTitle: {
    ...fonts.small,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  list: {
    paddingHorizontal: spacing.md,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: spacing.sm,
  },
  cardTitle: {
    ...fonts.subheading,
    marginBottom: spacing.xs,
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2,
  },
  cardLabel: {
    ...fonts.small,
  },
  cardValue: {
    ...fonts.mono,
    fontWeight: "500",
  },
  emptyText: {
    ...fonts.small,
    textAlign: "center",
    paddingTop: spacing.xl,
    fontSize: 14,
  },
});
