import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import {
  fetchExperiments,
  fetchMetadata,
  lamportsToSol,
  truncateAddress,
  ExptStatus,
  type ParsedExptConfig,
  type ExptMetadata,
} from "../../lib/api";
import { colors, spacing, radius, fonts } from "../../lib/theme";

const STATUS_FILTERS = [
  { label: "All", value: undefined },
  { label: "Active", value: ExptStatus.Active },
  { label: "Presale", value: ExptStatus.PresaleActive },
  { label: "Completed", value: ExptStatus.Completed },
  { label: "Failed", value: ExptStatus.PresaleFailed },
];

const STATUS_COLORS: Record<number, string> = {
  [ExptStatus.Created]: colors.mutedForeground,
  [ExptStatus.PresaleActive]: colors.warning,
  [ExptStatus.Active]: colors.primary,
  [ExptStatus.Completed]: colors.success,
  [ExptStatus.PresaleFailed]: colors.danger,
};

// Track metadata per experiment address
type MetadataMap = Record<string, ExptMetadata | null>;

export default function BrowseScreen() {
  const router = useRouter();
  const [experiments, setExperiments] = useState<ParsedExptConfig[]>([]);
  const [metadataMap, setMetadataMap] = useState<MetadataMap>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<ExptStatus | undefined>(
    undefined
  );

  const load = useCallback(async () => {
    try {
      const data = await fetchExperiments();
      setExperiments(data);

      // Fetch metadata for all experiments in parallel
      const entries = await Promise.all(
        data.map(async (e) => {
          const key = e.address.toBase58();
          const meta = await fetchMetadata(e.uri);
          return [key, meta] as [string, ExptMetadata | null];
        })
      );
      setMetadataMap(Object.fromEntries(entries));
    } catch (err) {
      console.error("Failed to fetch experiments:", err);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Client-side filter
  const filtered =
    activeFilter !== undefined
      ? experiments.filter((e) => e.status === activeFilter)
      : experiments;

  const renderExperiment = ({ item }: { item: ParsedExptConfig }) => {
    const key = item.address.toBase58();
    const meta = metadataMap[key];
    const treasury = lamportsToSol(item.totalTreasuryReceived);
    const statusColor = STATUS_COLORS[item.status] ?? colors.mutedForeground;
    const passedCount = item.milestones.filter((m) => m.status === 3).length;

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => router.push(`/experiment/${key}`)}
      >
        {/* Top row: avatar + name + badge */}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            {meta?.image ? (
              <Image
                source={{ uri: meta.image }}
                style={styles.tokenImage}
              />
            ) : (
              <View style={styles.tokenImageFallback}>
                <Text style={styles.tokenImageFallbackText}>
                  {item.name.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.cardTitleWrap}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.name}
                </Text>
                {meta?.symbol && (
                  <Text style={styles.ticker}>${meta.symbol}</Text>
                )}
              </View>
              <Text style={styles.builderAddr}>
                by {truncateAddress(item.builder.toBase58())}
              </Text>
            </View>
          </View>
          <View style={[styles.badge, { borderColor: statusColor }]}>
            <Text style={[styles.badgeText, { color: statusColor }]}>
              {item.statusLabel}
            </Text>
          </View>
        </View>

        {/* Stats row */}
        <View style={styles.cardStats}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Treasury</Text>
            <Text style={styles.statValue}>
              {treasury.toFixed(2)} SOL
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Shipped</Text>
            <Text style={styles.statValue}>
              {passedCount}/{item.milestoneCount}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Veto</Text>
            <Text style={styles.statValue}>
              {item.vetoThresholdPercent}%
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Filter chips */}
      <View style={styles.filters}>
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.label}
            style={[
              styles.chip,
              activeFilter === f.value && styles.chipActive,
            ]}
            onPress={() => setActiveFilter(f.value)}
          >
            <Text
              style={[
                styles.chipText,
                activeFilter === f.value && styles.chipTextActive,
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator
          size="large"
          color={colors.primary}
          style={styles.loader}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.address.toBase58()}
          renderItem={renderExperiment}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No experiments found</Text>
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
  filters: {
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  chipActive: {
    backgroundColor: colors.foreground,
    borderColor: colors.foreground,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.mutedForeground,
  },
  chipTextActive: {
    color: colors.background,
  },
  list: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.sm,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: spacing.sm,
    gap: spacing.sm,
  },
  tokenImage: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.secondary,
  },
  tokenImageFallback: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.foreground,
    justifyContent: "center",
    alignItems: "center",
  },
  tokenImageFallbackText: {
    color: colors.background,
    fontWeight: "700",
    fontSize: 14,
  },
  cardTitleWrap: {
    flex: 1,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardTitle: {
    ...fonts.subheading,
    fontSize: 15,
    flexShrink: 1,
  },
  ticker: {
    fontSize: 11,
    color: colors.mutedForeground,
    backgroundColor: colors.background,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: "hidden",
  },
  builderAddr: {
    ...fonts.mono,
    fontSize: 11,
    color: colors.mutedForeground,
    marginTop: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "500",
  },
  cardStats: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  stat: {
    alignItems: "center",
  },
  statLabel: {
    ...fonts.small,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statValue: {
    ...fonts.mono,
    fontWeight: "600",
    marginTop: 2,
  },
  loader: {
    flex: 1,
    justifyContent: "center",
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 80,
  },
  emptyText: {
    ...fonts.small,
    fontSize: 14,
  },
});
