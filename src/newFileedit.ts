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


