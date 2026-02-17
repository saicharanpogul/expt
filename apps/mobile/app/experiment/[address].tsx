import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  fetchExperiment,
  lamportsToSol,
  ExptStatus,
  MilestoneStatus,
  type ParsedExptConfig,
  type ParsedMilestone,
} from "../../lib/api";
import { colors, spacing, radius, fonts } from "../../lib/theme";

const STATUS_COLORS: Record<number, string> = {
  [ExptStatus.Created]: colors.mutedForeground,
  [ExptStatus.PresaleActive]: colors.warning,
  [ExptStatus.Active]: colors.info,
  [ExptStatus.Completed]: colors.success,
  [ExptStatus.PresaleFailed]: colors.danger,
};

const MS_STATUS_COLORS: Record<number, string> = {
  [MilestoneStatus.Pending]: colors.mutedForeground,
  [MilestoneStatus.Submitted]: colors.warning,
  [MilestoneStatus.Challenged]: "#D32F2F",
  [MilestoneStatus.Passed]: colors.success,
  [MilestoneStatus.Failed]: colors.danger,
};

export default function ExperimentDetailScreen() {
  const { address } = useLocalSearchParams<{ address: string }>();
  const [experiment, setExperiment] = useState<ParsedExptConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (address) {
      fetchExperiment(address)
        .then(setExperiment)
        .finally(() => setLoading(false));
    }
  }, [address]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.foreground} />
      </View>
    );
  }

  if (!experiment) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Experiment not found</Text>
        <Text style={[styles.mono, { marginTop: 4 }]}>{address}</Text>
      </View>
    );
  }

  const treasury = lamportsToSol(experiment.totalTreasuryReceived);
  const claimed = lamportsToSol(experiment.totalClaimedByBuilder);
  const statusColor = STATUS_COLORS[experiment.status] ?? colors.mutedForeground;

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{experiment.name}</Text>
        <View style={[styles.badge, { borderColor: statusColor }]}>
          <Text style={[styles.badgeText, { color: statusColor }]}>
            {experiment.statusLabel}
          </Text>
        </View>
      </View>

      {/* Stats grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Treasury</Text>
          <Text style={styles.statValue}>{treasury.toFixed(2)} SOL</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Claimed</Text>
          <Text style={styles.statValue}>{claimed.toFixed(2)} SOL</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Pool</Text>
          <Text style={styles.statValue}>
            {experiment.poolLaunched ? "✅ Launched" : "⏳ Pending"}
          </Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Milestones</Text>
          <Text style={styles.statValue}>{experiment.milestoneCount}</Text>
        </View>
      </View>

      {/* Details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Details</Text>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Builder</Text>
          <Text style={styles.mono}>
            {experiment.builder.toBase58().slice(0, 6)}...
            {experiment.builder.toBase58().slice(-4)}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Mint</Text>
          <Text style={styles.mono}>
            {experiment.mint.toBase58().slice(0, 6)}...
            {experiment.mint.toBase58().slice(-4)}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Veto Threshold</Text>
          <Text style={styles.mono}>
            {experiment.vetoThresholdPercent}%
          </Text>
        </View>
      </View>

      {/* Milestones */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Milestones</Text>
        {experiment.milestones.map((ms: ParsedMilestone) => {
          const msColor =
            MS_STATUS_COLORS[ms.status] ?? colors.mutedForeground;
          const vetoStake = lamportsToSol(ms.totalVetoStake);

          return (
            <View key={ms.index} style={styles.milestoneCard}>
              <View style={styles.milestoneHeader}>
                <Text style={styles.milestoneIndex}>#{ms.index + 1}</Text>
                <View style={[styles.msBadge, { borderColor: msColor }]}>
                  <Text style={[styles.msBadgeText, { color: msColor }]}>
                    {ms.statusLabel}
                  </Text>
                </View>
              </View>
              <Text style={styles.milestoneDesc} numberOfLines={2}>
                {ms.description}
              </Text>
              <View style={styles.milestoneStats}>
                <Text style={styles.msStat}>
                  Unlock: {ms.unlockPercent}%
                </Text>
                {vetoStake > 0 && (
                  <Text style={[styles.msStat, { color: colors.danger }]}>
                    Veto: {vetoStake.toFixed(2)} SOL
                  </Text>
                )}
              </View>
              {ms.deliverable ? (
                <Text
                  style={[styles.mono, { marginTop: 4 }]}
                  numberOfLines={1}
                >
                  📎 {ms.deliverable}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
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
    backgroundColor: colors.background,
  },
  errorText: {
    ...fonts.subheading,
    color: colors.danger,
  },
  header: {
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  title: {
    ...fonts.heading,
    flex: 1,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "500",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  statCard: {
    width: "47%",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  statLabel: {
    ...fonts.small,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statValue: {
    ...fonts.subheading,
    marginTop: 4,
  },
  section: {
    padding: spacing.md,
    paddingTop: spacing.lg,
  },
  sectionTitle: {
    ...fonts.small,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  detailLabel: {
    ...fonts.small,
  },
  mono: {
    ...fonts.mono,
  },
  milestoneCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: spacing.sm,
  },
  milestoneHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  milestoneIndex: {
    ...fonts.subheading,
    color: colors.mutedForeground,
  },
  msBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  msBadgeText: {
    fontSize: 10,
    fontWeight: "500",
  },
  milestoneDesc: {
    ...fonts.regular,
    lineHeight: 20,
  },
  milestoneStats: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  msStat: {
    ...fonts.small,
  },
});
