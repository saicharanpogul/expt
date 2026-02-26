import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Linking,
  RefreshControl,
  Alert,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  fetchExperiment,
  fetchMetadata,
  fetchTreasuryBalance,
  lamportsToSol,
  formatChallengeWindow,
  formatDate,
  truncateAddress,
  ExptStatus,
  MilestoneStatus,
  type ParsedExptConfig,
  type ParsedMilestone,
  type ExptMetadata,
} from "../../lib/api";
import { colors, spacing, radius, fonts } from "../../lib/theme";

// ── Color maps ──────────────────────────────────────────────────

const STATUS_COLORS: Record<number, string> = {
  [ExptStatus.Created]: colors.mutedForeground,
  [ExptStatus.PresaleActive]: colors.warning,
  [ExptStatus.Active]: colors.primary,
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

const MS_DOT_COLORS: Record<number, string> = {
  [MilestoneStatus.Pending]: colors.secondary,
  [MilestoneStatus.Submitted]: colors.warning,
  [MilestoneStatus.Challenged]: "#D32F2F",
  [MilestoneStatus.Passed]: colors.foreground,
  [MilestoneStatus.Failed]: "#D32F2F",
};

type Tab = "overview" | "milestones" | "treasury";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "milestones", label: "Milestones" },
  { key: "treasury", label: "Treasury" },
];

// ── Helpers ─────────────────────────────────────────────────────

function getSolscanUrl(address: string, type: "token" | "account" = "token") {
  return `https://solscan.io/${type}/${address}?cluster=devnet`;
}

function getJupiterUrl(mint: string) {
  return `https://jup.ag/swap/SOL-${mint}`;
}

function getMeteoraUrl(poolAddress: string) {
  return `https://devnet.meteora.ag/dammv2/${poolAddress}`;
}

// ── Component ───────────────────────────────────────────────────

export default function ExperimentDetailScreen() {
  const { address } = useLocalSearchParams<{ address: string }>();
  const [experiment, setExperiment] = useState<ParsedExptConfig | null>(null);
  const [metadata, setMetadata] = useState<ExptMetadata | null>(null);
  const [treasuryBalance, setTreasuryBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [copied, setCopied] = useState(false);

  const fetchData = useCallback(
    async (silent = false) => {
      if (!address) return;
      if (!silent) setLoading(true);
      try {
        const expt = await fetchExperiment(address);
        setExperiment(expt);
        if (expt) {
          const [meta, balance] = await Promise.all([
            fetchMetadata(expt.uri),
            fetchTreasuryBalance(address),
          ]);
          setMetadata(meta);
          setTreasuryBalance(balance);
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [address]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData(true);
    setRefreshing(false);
  }, [fetchData]);

  const copyCA = () => {
    if (!experiment) return;
    const mint = experiment.mint.toBase58();
    Alert.alert("Contract Address", mint);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // ── Loading ───────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // ── Not found ─────────────────────────────────────────────
  if (!experiment) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Experiment not found</Text>
        <Text style={[styles.mono, { marginTop: 4 }]}>{address}</Text>
      </View>
    );
  }

  const statusColor =
    STATUS_COLORS[experiment.status] ?? colors.mutedForeground;
  const passedCount = experiment.milestones.filter(
    (m) => m.status === MilestoneStatus.Passed
  ).length;
  const challengeDisplay = formatChallengeWindow(experiment.challengeWindow);
  const mintStr = experiment.mint.toBase58();
  const treasury = lamportsToSol(experiment.totalTreasuryReceived);
  const claimed = lamportsToSol(experiment.totalClaimedByBuilder);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* ── Header ──────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          {metadata?.image ? (
            <Image source={{ uri: metadata.image }} style={styles.heroImage} />
          ) : (
            <View style={styles.heroImageFallback}>
              <Text style={styles.heroImageFallbackText}>
                {experiment.name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.headerInfo}>
            <View style={styles.headerNameRow}>
              <Text style={styles.title} numberOfLines={1}>
                {experiment.name}
              </Text>
              <View style={[styles.badge, { borderColor: statusColor }]}>
                <Text style={[styles.badgeText, { color: statusColor }]}>
                  {experiment.statusLabel}
                </Text>
              </View>
            </View>
            <Text style={styles.builderLink}>
              by {truncateAddress(experiment.builder.toBase58())}
            </Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={styles.progressRow}>
          <Text style={styles.progressLabel}>Progress</Text>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${
                    experiment.milestoneCount > 0
                      ? (passedCount / experiment.milestoneCount) * 100
                      : 0
                  }%`,
                },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {passedCount}/{experiment.milestoneCount}
          </Text>
        </View>
      </View>

      {/* ── Quick Info Bar ──────────────────────────────────── */}
      <View style={styles.quickBar}>
        {/* Ticker + CA */}
        <View style={styles.quickBarRow}>
          {metadata?.symbol && (
            <View style={styles.tickerBadge}>
              <Text style={styles.tickerText}>${metadata.symbol}</Text>
            </View>
          )}
          <TouchableOpacity style={styles.copyBtn} onPress={copyCA}>
            <Text style={styles.copyLabel}>CA</Text>
            <Text style={styles.copyAddr}>{truncateAddress(mintStr)}</Text>
            <Text style={styles.copyIcon}>{copied ? "✓" : "📋"}</Text>
          </TouchableOpacity>
        </View>

        {/* External links */}
        <View style={styles.quickBarRow}>
          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => Linking.openURL(getSolscanUrl(mintStr))}
          >
            <Text style={styles.linkBtnText}>Solscan ↗</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.linkBtn, styles.linkBtnJup]}
            onPress={() => Linking.openURL(getJupiterUrl(mintStr))}
          >
            <Text style={[styles.linkBtnText, styles.linkBtnJupText]}>
              Jupiter ↗
            </Text>
          </TouchableOpacity>
          {experiment.poolLaunched ? (
            <TouchableOpacity
              style={[styles.linkBtn, styles.linkBtnMeteora]}
              onPress={() =>
                Linking.openURL(
                  getMeteoraUrl(experiment.dammPool.toBase58())
                )
              }
            >
              <Text style={[styles.linkBtnText, styles.linkBtnMeteoraText]}>
                Meteora ↗
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.linkBtn, { opacity: 0.3 }]}>
              <Text style={styles.linkBtnText}>Meteora</Text>
            </View>
          )}
        </View>

        {/* Pool status */}
        <View style={styles.quickBarRow}>
          <Text style={styles.quickMetaLabel}>Pool</Text>
          <Text
            style={[
              styles.quickMetaValue,
              { color: experiment.poolLaunched ? "#2D6A4F" : colors.warning },
            ]}
          >
            {experiment.poolLaunched ? "Live" : "Not launched"}
          </Text>
        </View>
      </View>

      {/* ── Tabs ────────────────────────────────────────────── */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab.key && styles.tabTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Tab Content ─────────────────────────────────────── */}
      {activeTab === "overview" && renderOverview()}
      {activeTab === "milestones" && renderMilestones()}
      {activeTab === "treasury" && renderTreasury()}

      <View style={{ height: 40 }} />
    </ScrollView>
  );

  // ── OVERVIEW TAB ──────────────────────────────────────────
  function renderOverview() {
    return (
      <View style={styles.tabContent}>
        {/* About */}
        {(metadata || experiment!.uri) && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>About</Text>
            {metadata?.image && (
              <Image
                source={{ uri: metadata.image }}
                style={styles.aboutImage}
              />
            )}
            {metadata?.name && (
              <View style={styles.aboutMeta}>
                <Text style={styles.aboutName}>{metadata.name}</Text>
                {metadata?.symbol && (
                  <Text style={styles.aboutSymbol}>${metadata.symbol}</Text>
                )}
              </View>
            )}
            {metadata?.description ? (
              <Text style={styles.aboutDesc}>{metadata.description}</Text>
            ) : (
              <Text style={styles.aboutDesc}>{experiment!.uri}</Text>
            )}
            {metadata?.properties?.category && (
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>
                  {metadata.properties.category}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Info grid */}
        <View style={styles.infoGrid}>
          <View style={styles.infoCard}>
            <Text style={styles.infoIcon}>💰</Text>
            <Text style={styles.infoLabel}>Treasury</Text>
            <Text style={styles.infoValue}>{treasury.toFixed(2)} SOL</Text>
            <Text style={styles.infoSub}>total received</Text>
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.infoIcon}>⏱</Text>
            <Text style={styles.infoLabel}>Challenge</Text>
            <Text style={styles.infoValue}>{challengeDisplay}</Text>
            <Text style={styles.infoSub}>veto period</Text>
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.infoIcon}>🛡</Text>
            <Text style={styles.infoLabel}>Veto Threshold</Text>
            <Text style={styles.infoValue}>
              {experiment!.vetoThresholdPercent}%
            </Text>
            <Text style={styles.infoSub}>of milestone value</Text>
          </View>
        </View>
      </View>
    );
  }

  // ── MILESTONES TAB ────────────────────────────────────────
  function renderMilestones() {
    return (
      <View style={styles.tabContent}>
        {experiment!.milestones.map((ms: ParsedMilestone) => {
          const msColor =
            MS_STATUS_COLORS[ms.status] ?? colors.mutedForeground;
          const dotColor = MS_DOT_COLORS[ms.status] ?? colors.secondary;
          const vetoStake = lamportsToSol(ms.totalVetoStake);
          const windowExpired = ms.challengeWindowEnd
            ? ms.challengeWindowEnd.getTime() < Date.now()
            : false;

          return (
            <View key={ms.index} style={styles.milestoneCard}>
              {/* Header */}
              <View style={styles.milestoneHeader}>
                <View style={styles.milestoneTitleRow}>
                  <View
                    style={[styles.msDot, { backgroundColor: dotColor }]}
                  />
                  <Text style={styles.milestoneIndex}>
                    Milestone {ms.index + 1}
                  </Text>
                </View>
                <View style={[styles.msBadge, { borderColor: msColor }]}>
                  <Text style={[styles.msBadgeText, { color: msColor }]}>
                    {ms.statusLabel}
                  </Text>
                </View>
              </View>

              {/* Description */}
              <Text style={styles.milestoneDesc}>{ms.description}</Text>

              {/* Meta row */}
              <View style={styles.msMetaRow}>
                <Text style={styles.msMeta}>
                  Unlock: {ms.unlockPercent}%
                </Text>
                <Text style={styles.msMeta}>
                  Deadline: {formatDate(ms.deadline)}
                </Text>
              </View>

              {/* Submitted info */}
              {ms.submittedAt && (
                <Text style={styles.msSubmitted}>
                  Submitted: {formatDate(ms.submittedAt)}
                </Text>
              )}

              {/* Deliverable */}
              {ms.deliverable ? (
                <TouchableOpacity
                  onPress={() => {
                    if (
                      ms.deliverable.startsWith("http://") ||
                      ms.deliverable.startsWith("https://")
                    ) {
                      Linking.openURL(ms.deliverable);
                    }
                  }}
                >
                  <Text style={styles.deliverable} numberOfLines={1}>
                    📎 {ms.deliverable}
                  </Text>
                </TouchableOpacity>
              ) : null}

              {/* Veto stake */}
              {vetoStake > 0 && (
                <Text style={styles.vetoStake}>
                  ⚠️ Veto Stake: {vetoStake.toFixed(4)} SOL
                </Text>
              )}

              {/* Challenge window */}
              {ms.status === MilestoneStatus.Submitted && (
                <Text
                  style={[
                    styles.windowStatus,
                    {
                      color: windowExpired ? colors.success : colors.warning,
                    },
                  ]}
                >
                  {windowExpired
                    ? "Veto window closed — ready to resolve"
                    : `Veto window open until ${formatDate(ms.challengeWindowEnd)}`}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    );
  }

  // ── TREASURY TAB ──────────────────────────────────────────
  function renderTreasury() {
    return (
      <View style={styles.tabContent}>
        <View style={styles.treasuryGrid}>
          <View style={styles.treasuryCard}>
            <Text style={styles.treasuryLabel}>Total Received</Text>
            <Text style={styles.treasuryValue}>
              {treasury.toFixed(4)} SOL
            </Text>
          </View>
          <View style={styles.treasuryCard}>
            <Text style={styles.treasuryLabel}>Builder Claimed</Text>
            <Text style={styles.treasuryValue}>
              {claimed.toFixed(4)} SOL
            </Text>
          </View>
          <View style={styles.treasuryCard}>
            <Text style={styles.treasuryLabel}>Live Balance</Text>
            <Text style={styles.treasuryValue}>
              {treasuryBalance !== null
                ? `${lamportsToSol(treasuryBalance).toFixed(4)} SOL`
                : "—"}
            </Text>
          </View>
          <View style={styles.treasuryCard}>
            <Text style={styles.treasuryLabel}>Pool Status</Text>
            <Text
              style={[
                styles.treasuryValue,
                {
                  color: experiment!.poolLaunched
                    ? colors.success
                    : colors.warning,
                },
              ]}
            >
              {experiment!.poolLaunched ? "✅ Launched" : "⏳ Pending"}
            </Text>
          </View>
        </View>

        {/* Milestone unlock breakdown */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Unlock Breakdown</Text>
          {experiment!.milestones.map((ms) => {
            const isPassed = ms.status === MilestoneStatus.Passed;
            const isFailed = ms.status === MilestoneStatus.Failed;
            return (
              <View key={ms.index} style={styles.unlockRow}>
                <View style={styles.unlockLeft}>
                  <Text
                    style={[
                      styles.unlockDot,
                      {
                        color: isPassed
                          ? colors.success
                          : isFailed
                          ? colors.danger
                          : colors.mutedForeground,
                      },
                    ]}
                  >
                    {isPassed ? "✓" : isFailed ? "✕" : "○"}
                  </Text>
                  <Text style={styles.unlockLabel}>
                    Milestone {ms.index + 1}
                  </Text>
                </View>
                <Text style={styles.unlockPercent}>
                  {ms.unlockPercent}%
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  }
}

// ── Styles ────────────────────────────────────────────────────

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
  mono: {
    ...fonts.mono,
  },

  // ── Header ─────────────────────────────────────────────
  header: {
    padding: spacing.md,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  heroImage: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.secondary,
  },
  heroImageFallback: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.foreground,
    justifyContent: "center",
    alignItems: "center",
  },
  heroImageFallbackText: {
    color: colors.background,
    fontWeight: "700",
    fontSize: 18,
  },
  headerInfo: {
    flex: 1,
  },
  headerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    ...fonts.heading,
    fontSize: 18,
    flexShrink: 1,
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
  builderLink: {
    ...fonts.mono,
    fontSize: 12,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  progressLabel: {
    fontSize: 11,
    color: colors.mutedForeground,
  },
  progressBarBg: {
    flex: 1,
    height: 5,
    backgroundColor: colors.secondary,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: colors.foreground,
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.foreground,
  },

  // ── Quick Info Bar ─────────────────────────────────────
  quickBar: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.foreground,
    borderRadius: radius.lg,
    padding: spacing.sm,
    gap: 8,
  },
  quickBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  tickerBadge: {
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
  },
  tickerText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  copyLabel: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 10,
  },
  copyAddr: {
    color: "rgba(255,255,255,0.7)",
    fontFamily: "monospace",
    fontSize: 11,
  },
  copyIcon: {
    fontSize: 10,
  },
  linkBtn: {
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
  },
  linkBtnText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    fontWeight: "500",
  },
  linkBtnJup: {
    backgroundColor: "rgba(199,242,132,0.15)",
  },
  linkBtnJupText: {
    color: "#C7F284",
  },
  linkBtnMeteora: {
    backgroundColor: "rgba(224,159,62,0.15)",
  },
  linkBtnMeteoraText: {
    color: "#E09F3E",
  },
  quickMetaLabel: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
  },
  quickMetaValue: {
    fontSize: 11,
    fontWeight: "500",
  },

  // ── Tabs ───────────────────────────────────────────────
  tabBar: {
    flexDirection: "row",
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: radius.md,
  },
  tabActive: {
    backgroundColor: colors.background,
  },
  tabText: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.mutedForeground,
  },
  tabTextActive: {
    color: colors.foreground,
    fontWeight: "600",
  },

  // ── Tab content ────────────────────────────────────────
  tabContent: {
    paddingHorizontal: spacing.md,
  },

  // ── Overview ───────────────────────────────────────────
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...fonts.small,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  aboutImage: {
    width: 56,
    height: 56,
    borderRadius: 14,
    marginBottom: spacing.sm,
    backgroundColor: colors.secondary,
  },
  aboutMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  aboutName: {
    ...fonts.subheading,
    fontSize: 15,
  },
  aboutSymbol: {
    fontSize: 11,
    color: colors.mutedForeground,
    backgroundColor: colors.background,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: "hidden",
  },
  aboutDesc: {
    fontSize: 13,
    color: colors.mutedForeground,
    lineHeight: 20,
  },
  categoryBadge: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: "rgba(222,222,227,0.5)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  categoryText: {
    fontSize: 10,
    color: colors.mutedForeground,
  },
  infoGrid: {
    gap: spacing.sm,
  },
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  infoIcon: {
    fontSize: 16,
    marginBottom: 4,
  },
  infoLabel: {
    ...fonts.small,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoValue: {
    ...fonts.subheading,
    marginTop: 4,
  },
  infoSub: {
    ...fonts.small,
    fontSize: 11,
    marginTop: 1,
  },

  // ── Milestones ─────────────────────────────────────────
  milestoneCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
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
  milestoneTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  msDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  milestoneIndex: {
    ...fonts.subheading,
    fontSize: 14,
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
    color: colors.mutedForeground,
    marginBottom: spacing.xs,
  },
  msMetaRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: 4,
  },
  msMeta: {
    ...fonts.small,
    fontSize: 11,
  },
  msSubmitted: {
    ...fonts.small,
    fontSize: 11,
    marginBottom: 4,
  },
  deliverable: {
    ...fonts.mono,
    fontSize: 12,
    color: colors.info,
    marginTop: 4,
  },
  vetoStake: {
    ...fonts.small,
    color: colors.danger,
    marginTop: 6,
    fontSize: 12,
  },
  windowStatus: {
    ...fonts.small,
    fontSize: 11,
    marginTop: 6,
    fontWeight: "500",
  },

  // ── Treasury ───────────────────────────────────────────
  treasuryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  treasuryCard: {
    width: "47%",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  treasuryLabel: {
    ...fonts.small,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  treasuryValue: {
    ...fonts.subheading,
    marginTop: 6,
  },
  unlockRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  unlockLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  unlockDot: {
    fontSize: 14,
    fontWeight: "600",
  },
  unlockLabel: {
    ...fonts.regular,
    fontSize: 13,
  },
  unlockPercent: {
    ...fonts.mono,
    fontWeight: "600",
    fontSize: 13,
  },
});
