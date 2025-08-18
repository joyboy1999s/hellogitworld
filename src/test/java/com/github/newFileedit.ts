import { Octokit } from "@octokit/core";
import { CodeFile } from "../../models/CodeFile";
import { DataSource } from "typeorm";

// GitHub API response types
interface GitHubRepository {
  name: string;
  full_name: string;
  description: string | null;
  visibility: string;
  default_branch: string;
  html_url: string;
  owner: {
    login: string;
    avatar_url: string;
  };
}

interface GitHubCommit {
  commit: {
    tree: {
      sha: string;
    };
  };
}

interface GitHubTreeItem {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

interface GitHubTreeResponse {
  sha: string;
  url: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
}

// GitLab API response types
interface GitLabTreeItem {
  id: string;
  name: string;
  type: 'tree' | 'blob';
  sha: string;
  path: string;
  mode: string;
}

// Bitbucket API response types
interface BitbucketTreeItem {
  path: string;
  type: 'commit_file' | 'commit_directory';
  size?: number;
  attributes?: any;
}

interface BitbucketTreeResponse {
  values: BitbucketTreeItem[];
  size: number;
  isLastPage: boolean;
  nextPageStart?: number;
}

// Represents a node in the file tree (file or folder)
export interface FileTreeNode {
  type: 'file' | 'folder';
  name: string;
  path: string;
  sha?: string;
  children?: FileTreeNode[];
}

/
