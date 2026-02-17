import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import {
  fetchExperiments,
  statusLabel,
  lamportsToSol,
  type Experiment,
} from "../../lib/api";
import { colors, spacing, radius, fonts } from "../../lib/theme";

const STATUS_FILTERS = [
  { label: "All", value: undefined },
  { label: "Active", value: 2 },
  { label: "Presale", value: 1 },
  { label: "Completed", value: 3 },
  { label: "Failed", value: 5 },
];

const STATUS_COLORS: Record<number, string> = {
  0: colors.mutedForeground,
  1: colors.warning,
  2: colors.info,
  3: colors.success,
  4: colors.danger,
  5: colors.danger,
};

export default function BrowseScreen() {
  const router = useRouter();
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<number | undefined>(
    undefined
  );

  const load = useCallback(async (status?: number) => {
    try {
      const data = await fetchExperiments(status);
      setExperiments(data);
    } catch (err) {
      console.error("Failed to fetch experiments:", err);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load(activeFilter).finally(() => setLoading(false));
  }, [activeFilter, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(activeFilter);
    setRefreshing(false);
  }, [activeFilter, load]);

  const renderExperiment = ({ item }: { item: Experiment }) => {
    const treasury = lamportsToSol(item.total_treasury_received);
    const statusColor = STATUS_COLORS[item.status] || colors.mutedForeground;

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => router.push(`/experiment/${item.address}`)}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={[styles.badge, { borderColor: statusColor }]}>
            <Text style={[styles.badgeText, { color: statusColor }]}>
              {statusLabel(item.status)}
            </Text>
          </View>
        </View>

        <View style={styles.cardStats}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Treasury</Text>
            <Text style={styles.statValue}>
              {treasury.toFixed(2)} SOL
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Milestones</Text>
            <Text style={styles.statValue}>{item.milestone_count}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Veto BPS</Text>
            <Text style={styles.statValue}>{item.veto_threshold_bps}</Text>
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
          color={colors.foreground}
          style={styles.loader}
        />
      ) : (
        <FlatList
          data={experiments}
          keyExtractor={(item) => item.address}
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
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  cardTitle: {
    ...fonts.subheading,
    flex: 1,
    marginRight: spacing.sm,
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
