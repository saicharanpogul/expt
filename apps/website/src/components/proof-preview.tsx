"use client";

import { useState, useEffect } from "react";
import { ExternalLink, Github, Globe, Terminal, Rocket, FileText, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeliverableType } from "@expt/sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProofPreviewProps {
  deliverable: string;          // The submitted proof URL/value
  deliverableType: DeliverableType;
  milestoneIndex: number;
}

interface GithubRepoInfo {
  name: string;
  fullName: string;
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  updatedAt: string;
  htmlUrl: string;
  readmeHtml?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

function extractGithubRepo(url: string): { owner: string; repo: string } | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("github.com")) return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) return { owner: parts[0], repo: parts[1] };
    return null;
  } catch {
    return null;
  }
}

function isSolanaAddress(str: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(str.trim());
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** URL deliverable — clickable link with optional iframe preview */
function UrlPreview({ url }: { url: string }) {
  const [showPreview, setShowPreview] = useState(false);
  const [iframeError, setIframeError] = useState(false);

  return (
    <div className="mt-3 ml-4 rounded-lg border border-[#E5E5E5] bg-[#FAFAF9] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <Globe className="h-4 w-4 text-[#6A6D78] shrink-0" />
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[#140E1C] hover:underline truncate font-medium"
          >
            {url}
          </a>
          <ExternalLink className="h-3 w-3 text-[#6A6D78] shrink-0" />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowPreview(!showPreview)}
          className="text-xs text-[#6A6D78] hover:text-[#140E1C] h-6 px-2 shrink-0"
        >
          {showPreview ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
          {showPreview ? "Hide" : "Preview"}
        </Button>
      </div>
      {showPreview && (
        <div className="border-t border-[#E5E5E5]">
          {iframeError ? (
            <div className="flex items-center justify-center py-8 text-sm text-[#6A6D78]">
              <XCircle className="h-4 w-4 mr-2 text-[#D32F2F]" />
              Preview not available — site blocks embedding
            </div>
          ) : (
            <iframe
              src={url}
              className="w-full h-[300px] border-0"
              sandbox="allow-scripts allow-same-origin"
              onError={() => setIframeError(true)}
              title="Deliverable preview"
            />
          )}
        </div>
      )}
    </div>
  );
}

/** GitHub deliverable — repo card with stats + README preview */
function GithubPreview({ url }: { url: string }) {
  const [repoInfo, setRepoInfo] = useState<GithubRepoInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showReadme, setShowReadme] = useState(false);

  useEffect(() => {
    const repo = extractGithubRepo(url);
    if (!repo) {
      setError("Not a valid GitHub repository URL");
      setLoading(false);
      return;
    }

    const fetchRepo = async () => {
      try {
        const res = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}`);
        if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
        const data = await res.json();
        const info: GithubRepoInfo = {
          name: data.name,
          fullName: data.full_name,
          description: data.description,
          stars: data.stargazers_count,
          forks: data.forks_count,
          language: data.language,
          updatedAt: data.updated_at,
          htmlUrl: data.html_url,
        };

        // Fetch README
        try {
          const readmeRes = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/readme`, {
            headers: { Accept: "application/vnd.github.html+json" },
          });
          if (readmeRes.ok) {
            info.readmeHtml = await readmeRes.text();
          }
        } catch {
          // README not available — that's fine
        }

        setRepoInfo(info);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    fetchRepo();
  }, [url]);

  if (loading) {
    return (
      <div className="mt-3 ml-4 flex items-center gap-2 text-sm text-[#6A6D78]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading GitHub repository...
      </div>
    );
  }

  if (error || !repoInfo) {
    return (
      <div className="mt-3 ml-4 rounded-lg border border-[#E5E5E5] bg-[#FAFAF9] px-3 py-2">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-[#140E1C] hover:underline"
        >
          <Github className="h-4 w-4" />
          {url}
          <ExternalLink className="h-3 w-3 text-[#6A6D78]" />
        </a>
        {error && <p className="text-xs text-[#D32F2F] mt-1">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-3 ml-4 rounded-lg border border-[#E5E5E5] bg-[#FAFAF9] overflow-hidden">
      {/* Repo header */}
      <div className="px-3 py-2.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <a
            href={repoInfo.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm font-medium text-[#140E1C] hover:underline"
          >
            <Github className="h-4 w-4 shrink-0" />
            <span className="truncate">{repoInfo.fullName}</span>
            <ExternalLink className="h-3 w-3 text-[#6A6D78] shrink-0" />
          </a>
          {repoInfo.description && (
            <p className="text-xs text-[#6A6D78] mt-1 line-clamp-2">{repoInfo.description}</p>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="px-3 py-1.5 border-t border-[#E5E5E5] flex items-center gap-4 text-xs text-[#6A6D78]">
        {repoInfo.language && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#E09F3E]" />
            {repoInfo.language}
          </span>
        )}
        <span>⭐ {repoInfo.stars.toLocaleString()}</span>
        <span>🔱 {repoInfo.forks.toLocaleString()}</span>
        <span>Updated {new Date(repoInfo.updatedAt).toLocaleDateString()}</span>

        {repoInfo.readmeHtml && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowReadme(!showReadme)}
            className="text-xs text-[#6A6D78] hover:text-[#140E1C] h-5 px-1.5 ml-auto"
          >
            <FileText className="h-3 w-3 mr-1" />
            {showReadme ? "Hide" : "README"}
          </Button>
        )}
      </div>

      {/* README preview */}
      {showReadme && repoInfo.readmeHtml && (
        <div className="border-t border-[#E5E5E5] px-4 py-3 max-h-[400px] overflow-y-auto">
          <div
            className="prose prose-sm prose-neutral max-w-none"
            dangerouslySetInnerHTML={{ __html: repoInfo.readmeHtml }}
          />
        </div>
      )}
    </div>
  );
}

/** Program ID deliverable — Solscan link + on-chain verification */
function ProgramIdPreview({ programId }: { programId: string }) {
  const cleanId = programId.trim();
  const isValid = isSolanaAddress(cleanId);
  const solscanUrl = `https://solscan.io/account/${cleanId}`;

  return (
    <div className="mt-3 ml-4 rounded-lg border border-[#E5E5E5] bg-[#FAFAF9] px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Terminal className="h-4 w-4 text-[#6A6D78] shrink-0" />
          <code className="text-xs font-mono text-[#140E1C] truncate bg-[#F0F0F0] px-1.5 py-0.5 rounded">
            {cleanId}
          </code>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isValid ? (
            <Badge variant="outline" className="bg-[#4CAF50]/10 text-[#4CAF50] border-[#4CAF50]/20 text-[10px]">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Valid address
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-[#D32F2F]/10 text-[#D32F2F] border-[#D32F2F]/20 text-[10px]">
              <XCircle className="h-3 w-3 mr-1" /> Invalid
            </Badge>
          )}
          <a
            href={solscanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[#140E1C] hover:underline font-medium"
          >
            Solscan <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

/** Deployment deliverable — clickable link with rocket icon */
function DeploymentPreview({ url }: { url: string }) {
  return (
    <div className="mt-3 ml-4 rounded-lg border border-[#E5E5E5] bg-[#FAFAF9] px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Rocket className="h-4 w-4 text-[#E09F3E] shrink-0" />
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-[#140E1C] hover:underline truncate font-medium"
        >
          {url}
        </a>
        <ExternalLink className="h-3 w-3 text-[#6A6D78] shrink-0" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ProofPreview({ deliverable, deliverableType, milestoneIndex }: ProofPreviewProps) {
  if (!deliverable) return null;

  switch (deliverableType) {
    case DeliverableType.Url:
      return <UrlPreview url={deliverable} />;

    case DeliverableType.Github:
      return <GithubPreview url={deliverable} />;

    case DeliverableType.ProgramId:
      return <ProgramIdPreview programId={deliverable} />;

    case DeliverableType.Deployment:
      return <DeploymentPreview url={deliverable} />;

    default:
      // Fallback — simple link
      return (
        <div className="mt-3 ml-4">
          <a
            href={isValidUrl(deliverable) ? deliverable : undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[#140E1C] hover:underline"
          >
            View deliverable <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      );
  }
}
