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
  fetchBuilder,
  statusLabel,
  lamportsToSol,
  type Builder,
  type Experiment,
} from "../../lib/api";
import { colors, spacing, radius, fonts } from "../../lib/theme";

export default function ProfileScreen() {
  const router = useRouter();
  const [wallet, setWallet] = useState<string | null>(null);
  const [builder, setBuilder] = useState<Builder | null>(null);
  const [loading, setLoading] = useState(false);

  const handleConnect = useCallback(async () => {
    setLoading(true);
    try {
      const pubkey = await connectWallet();
      if (pubkey) {
        const walletAddr = pubkey.toBase58();
        setWallet(walletAddr);

        // Fetch builder profile from indexer
        const b = await fetchBuilder(walletAddr);
        setBuilder(b);
      } else {
        Alert.alert("Connection Failed", "Could not connect to wallet.");
      }
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
    }
  }, []);

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

  // ── Connected but no builder profile ──────────────────────────
  if (!builder) {
    return (
      <View style={styles.center}>
        <Text style={styles.emoji}>🔬</Text>
        <Text style={styles.title}>No Builder Profile</Text>
        <Text style={styles.subtitle}>
          Connected as {wallet.slice(0, 4)}...{wallet.slice(-4)}
        </Text>
        <Text style={[styles.subtitle, { marginTop: 4 }]}>
          Create a Builder profile on expt.fun to start building!
        </Text>
      </View>
    );
  }

  // ── Builder profile ───────────────────────────────────────────
  const renderExperiment = ({ item }: { item: Experiment }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={() => router.push(`/experiment/${item.address}`)}
    >
      <Text style={styles.cardTitle} numberOfLines={1}>
        {item.name}
      </Text>
      <View style={styles.cardRow}>
        <Text style={styles.cardLabel}>{statusLabel(item.status)}</Text>
        <Text style={styles.cardValue}>
          {lamportsToSol(item.total_treasury_received).toFixed(2)} SOL
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Profile header */}
      <View style={styles.profileHeader}>
        <Text style={styles.profileEmoji}>👤</Text>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>@{builder.x_username}</Text>
          <Text style={styles.profileWallet}>
            {wallet.slice(0, 6)}...{wallet.slice(-4)}
          </Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{builder.experiment_count}</Text>
          <Text style={styles.statLabel}>Experiments</Text>
        </View>
        {builder.github && (
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>🐙</Text>
            <Text style={styles.statLabel}>{builder.github}</Text>
          </View>
        )}
        {builder.telegram && (
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>✈️</Text>
            <Text style={styles.statLabel}>{builder.telegram}</Text>
          </View>
        )}
      </View>

      {/* Experiments list */}
      <Text style={styles.sectionTitle}>Your Experiments</Text>
      <FlatList
        data={builder.experiments || []}
        keyExtractor={(item) => item.address}
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
  profileEmoji: {
    fontSize: 40,
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
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    gap: spacing.md,
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
