import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Image,
  TextInput,
  Animated,
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

// ── Skeleton Card ──────────────────────────────────────────────

function SkeletonCard({ delay = 0 }: { delay?: number }) {
  const opacity = useState(new Animated.Value(0.3))[0];

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          delay,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity, delay]);

  return (
    <Animated.View style={[styles.card, { opacity }]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <View
            style={[
              styles.tokenImageFallback,
              { backgroundColor: colors.secondary },
            ]}
          />
          <View style={styles.cardTitleWrap}>
            <View
              style={{
                height: 14,
                width: 120,
                backgroundColor: colors.secondary,
                borderRadius: 4,
              }}
            />
            <View
              style={{
                height: 10,
                width: 80,
                backgroundColor: colors.secondary,
                borderRadius: 4,
                marginTop: 6,
              }}
            />
          </View>
        </View>
        <View
          style={{
            height: 18,
            width: 50,
            backgroundColor: colors.secondary,
            borderRadius: radius.full,
          }}
        />
      </View>
      <View style={styles.cardStats}>
        {[1, 2, 3].map((i) => (
          <View key={i} style={styles.stat}>
            <View
              style={{
                height: 8,
                width: 40,
                backgroundColor: colors.secondary,
                borderRadius: 3,
              }}
            />
            <View
              style={{
                height: 12,
                width: 50,
                backgroundColor: colors.secondary,
                borderRadius: 3,
                marginTop: 4,
              }}
            />
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

// ── Main Component ────────────────────────────────────────────

export default function BrowseScreen() {
  const router = useRouter();
  const [experiments, setExperiments] = useState<ParsedExptConfig[]>([]);
  const [metadataMap, setMetadataMap] = useState<MetadataMap>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<ExptStatus | undefined>(
    undefined
  );
  const [searchQuery, setSearchQuery] = useState("");

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

  // Client-side filter + search
  const filtered = experiments.filter((e) => {
    // Status filter
    if (activeFilter !== undefined && e.status !== activeFilter) return false;
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const key = e.address.toBase58();
      const meta = metadataMap[key];
      const nameMatch = e.name.toLowerCase().includes(q);
      const symbolMatch = meta?.symbol?.toLowerCase().includes(q) ?? false;
      const addrMatch = key.toLowerCase().includes(q);
      return nameMatch || symbolMatch || addrMatch;
    }
    return true;
  });

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

        {/* Milestone progress bar */}
        <View style={styles.milestoneProgress}>
          <View style={styles.milestoneBarBg}>
            <View
              style={[
                styles.milestoneBarFill,
                {
                  width: `${
                    item.milestoneCount > 0
                      ? (passedCount / item.milestoneCount) * 100
                      : 0
                  }%`,
                },
              ]}
            />
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
      {/* Search bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search experiments..."
            placeholderTextColor={colors.mutedForeground}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Text style={styles.clearBtn}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

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
        <View style={styles.skeletonList}>
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} delay={i * 150} />
          ))}
        </View>
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
              <Text style={styles.emptyEmoji}>🔬</Text>
              <Text style={styles.emptyText}>
                {searchQuery
                  ? "No experiments match your search"
                  : "No experiments found"}
              </Text>
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
  searchContainer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 4,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 40,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 8,
  },
  searchIcon: {
    fontSize: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.foreground,
    paddingVertical: 0,
  },
  clearBtn: {
    fontSize: 14,
    color: colors.mutedForeground,
    paddingHorizontal: 4,
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
  skeletonList: {
    padding: spacing.md,
    gap: spacing.sm,
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
  milestoneProgress: {
    marginBottom: spacing.sm,
  },
  milestoneBarBg: {
    height: 3,
    backgroundColor: colors.secondary,
    borderRadius: 2,
    overflow: "hidden",
  },
  milestoneBarFill: {
    height: "100%",
    backgroundColor: colors.foreground,
    borderRadius: 2,
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
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 80,
  },
  emptyEmoji: {
    fontSize: 36,
    marginBottom: spacing.sm,
  },
  emptyText: {
    ...fonts.small,
    fontSize: 14,
  },
});
