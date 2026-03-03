import { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Animated,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { connectWallet } from "../../lib/wallet";
import {
  fetchExperimentsByBuilder,
  lamportsToSol,
  truncateAddress,
  ExptStatus,
  type ParsedExptConfig,
} from "../../lib/api";
import { colors, spacing, radius, fonts } from "../../lib/theme";

const STATUS_COLORS: Record<number, string> = {
  [ExptStatus.Created]: colors.mutedForeground,
  [ExptStatus.PresaleActive]: colors.warning,
  [ExptStatus.Active]: colors.foreground,
  [ExptStatus.Completed]: colors.success,
  [ExptStatus.PresaleFailed]: colors.danger,
};

// ── Skeleton Card ──────────────────────────────────────────────

function SkeletonCard() {
  const opacity = useState(new Animated.Value(0.3))[0];

  useState(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  });

  return (
    <Animated.View style={[styles.card, { opacity }]}>
      <View
        style={{
          height: 14,
          width: 130,
          backgroundColor: colors.secondary,
          borderRadius: 4,
          marginBottom: 8,
        }}
      />
      <View
        style={{
          height: 10,
          width: 90,
          backgroundColor: colors.secondary,
          borderRadius: 3,
        }}
      />
    </Animated.View>
  );
}

// ── Main Component ────────────────────────────────────────────

export default function ProfileScreen() {
  const router = useRouter();
  const [wallet, setWallet] = useState<string | null>(null);
  const [experiments, setExperiments] = useState<ParsedExptConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [walletCopied, setWalletCopied] = useState(false);

  const handleConnect = useCallback(async () => {
    setLoading(true);
    try {
      const pubkey = await connectWallet();
      if (pubkey) {
        const walletAddr = pubkey.toBase58();
        setWallet(walletAddr);
        const expts = await fetchExperimentsByBuilder(walletAddr);
        setExperiments(expts);
      }
    } catch (err: any) {
      console.error("Wallet connect failed:", err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDisconnect = () => {
    setWallet(null);
    setExperiments([]);
  };

  const handleRefresh = useCallback(async () => {
    if (!wallet) return;
    setRefreshing(true);
    try {
      const expts = await fetchExperimentsByBuilder(wallet);
      setExperiments(expts);
    } catch (err) {
      console.error("Refresh failed:", err);
    } finally {
      setRefreshing(false);
    }
  }, [wallet]);

  const copyWalletAddress = async () => {
    if (!wallet) return;
    await Clipboard.setStringAsync(wallet);
    setWalletCopied(true);
    setTimeout(() => setWalletCopied(false), 1500);
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
    const statusColor = STATUS_COLORS[item.status] ?? colors.mutedForeground;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => router.push(`/experiment/${item.address.toBase58()}`)}
      >
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={[styles.statusBadge, { borderColor: statusColor }]}>
            <Text style={[styles.statusBadgeText, { color: statusColor }]}>
              {item.statusLabel}
            </Text>
          </View>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>Shipped</Text>
          <Text style={styles.cardValue}>
            {passedCount}/{item.milestoneCount}
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
          <TouchableOpacity onPress={copyWalletAddress}>
            <Text style={styles.profileWallet}>
              {truncateAddress(wallet)}{" "}
              <Text style={{ fontSize: 10 }}>
                {walletCopied ? "✓" : "📋"}
              </Text>
            </Text>
          </TouchableOpacity>
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

      {loading ? (
        <View style={styles.skeletonList}>
          {[0, 1].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </View>
      ) : (
        <FlatList
          data={experiments}
          keyExtractor={(item) => item.address.toBase58()}
          renderItem={renderExperiment}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🔬</Text>
              <Text style={styles.emptyText}>No experiments yet</Text>
              <TouchableOpacity
                style={styles.browseCta}
                onPress={() => router.push("/(tabs)/browse")}
              >
                <Text style={styles.browseCtaText}>Browse Experiments</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
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
  skeletonList: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
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
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  cardTitle: {
    ...fonts.subheading,
    flex: 1,
    marginRight: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "500",
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
  emptyState: {
    alignItems: "center",
    paddingTop: spacing.xl,
  },
  emptyEmoji: {
    fontSize: 36,
    marginBottom: spacing.sm,
  },
  emptyText: {
    ...fonts.small,
    fontSize: 14,
    marginBottom: spacing.md,
  },
  browseCta: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.foreground,
  },
  browseCtaText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.foreground,
  },
});
