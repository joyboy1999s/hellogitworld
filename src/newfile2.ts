import { Octokit } from "@octokit/core";
import { CodeFile } from "../../models/CodeFile";
import { DataSource } from "typeorm";

// GitHub API response types
// new line added  f2113ea0e96d44c8d522966310067b4fd951d8ce
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

// Generic interface for any Git provider
export interface GitProviderSyncInput {
  id?: any;
  owner?: any;
  repo?: any;
  default_branch?: any;
  token?: any;
  created_user_id?: any;
  provider?: any;
}

// Generic Git provider interface
export interface GitProvider {
  getRepositoryTree(owner: string, repo: string, token: string, default_branch: string): Promise<{
    repository?: any;
    tree?: FileTreeNode[];
    error?: boolean;
    message?: string;
  }>;
}

// GitHub-specific implementation
export class GitHubProvider implements GitProvider {
  private octokit: Octokit;

  constructor() {
    this.octokit = new Octokit();
  }

  async getRepositoryTree(owner: string, repo: string, token: string, default_branch: string): Promise<{
    repository?: any;
    tree?: FileTreeNode[];
    error?: boolean;
    message?: string;
  }> {
    console.log("777777777777777",owner,token,repo,default_branch)
    try {
      this.octokit = new Octokit({ auth: token });

      const { data: repoMeta } = await this.octokit.request("GET /repos/{owner}/{repo}", {
        owner,
        repo,
      }) as { data: GitHubRepository };
console.log("88888888888888888888");
      // const branch = repoMeta.default_branch;

      const { data: commitData } = await this.octokit.request(
        "GET /repos/{owner}/{repo}/commits/{ref}",
        {
          owner,
          repo,
          ref: default_branch,
        }
      ) as { data: GitHubCommit };
console.log("999999999999999999");

      const { data: treeData } = await this.octokit.request(
        "GET /repos/{owner}/{repo}/git/trees/{tree_sha}?recursive=1",
        {
          owner,
          repo,
          tree_sha: commitData.commit.tree.sha,
        }
      ) as { data: GitHubTreeResponse };
console.log("1000000000000000000");

      const tree = this.buildNestedTree(treeData.tree);
console.log("200000000000000000000",tree);

      return {
        repository: {
          name: repoMeta.name,
          full_name: repoMeta.full_name,
          description: repoMeta.description,
          visibility: repoMeta.visibility,
          default_branch: default_branch,
          html_url: repoMeta.html_url,
          owner: {
            login: repoMeta.owner.login,
            avatar_url: repoMeta.owner.avatar_url,
          },
        },
        tree,
      };
    } catch (err: any) {
      console.error("Failed to fetch GitHub repository tree:", err.message || err);

      // Enhanced error handling with specific messages
      if (err.status === 401) {
        return {
          error: true,
          message: "401 Unauthorized - Invalid or expired GitHub token",
        };
      }

      if (err.status === 403) {
        return {
          error: true,
          message: "403 Forbidden - Token doesn't have permission to access this repository",
        };
      }

      if (err.status === 404) {
        return {
          error: true,
          message: "404 Not Found - Repository not found",
        };
      }

      if (err.status === 422) {
        return {
          error: true,
          message: "422 Unprocessable Entity - Invalid repository or owner name",
        };
      }

      if (err.status === 429) {
        return {
          error: true,
          message: "429 Rate limit exceeded - Too many requests to GitHub API",
        };
      }

      if (err.message?.includes('NetworkError') || err.message?.includes('fetch')) {
        return {
          error: true,
          message: "Network error - Unable to connect to GitHub API",
        };
      }

      return {
        error: true,
        message: err.message || "Unknown error fetching GitHub repository tree",
      };
    }
  }

  private buildNestedTree(flatTree: GitHubTreeItem[]): FileTreeNode[] {
    const pathMap: Record<string, any[]> = {};

    flatTree.forEach((item) => {
      const parts = item.path.split("/");
      const fileName = parts.pop()!;
      const parentDir = parts.join("/");

      if (!pathMap[parentDir]) pathMap[parentDir] = [];

      if (item.type === "blob") {
        pathMap[parentDir].push({
          type: "file",
          name: fileName,
          path: item.path,
          sha: item.sha,
        });
      } else if (item.type === "tree") {
        pathMap[parentDir].push({
          type: "folder",
          name: fileName,
          path: item.path,
          children: [],
        });
      }
    });

    const sortAndAttach = (basePath: string): FileTreeNode[] => {
      const isSpecial = (name: string) => /^[^a-zA-Z0-9]/.test(name);

      const sortedItems = (pathMap[basePath] || []).sort((a, b) => {
        const aSpecial = isSpecial(a.name);
        const bSpecial = isSpecial(b.name);
        if (a.type === b.type) {
          if (aSpecial && !bSpecial) return -1;
          if (!aSpecial && bSpecial) return 1;
          return a.name.localeCompare(b.name);
        }
        return a.type === "folder" ? -1 : 1;
      });

      return sortedItems.map((item) => {
        if (item.type === "folder") {
          const newPath = basePath ? `${basePath}/${item.name}` : item.name;
          item.children = sortAndAttach(newPath);
        }
        return item;
      });
    };

    return sortAndAttach("");
  }
}

// GitLab-specific implementation (example)
export class GitLabProvider implements GitProvider {
  async getRepositoryTree(owner: string, repo: string, token: string, default_branch: string): Promise<{
    repository?: any;
    tree?: FileTreeNode[];
    error?: boolean;
    message?: string;
  }> {
    try {
      // GitLab API implementation would go here
      // Using GitLab's REST API v4
      const response = await fetch(`https://gitlab.com/api/v4/projects/${encodeURIComponent(owner + '/' + repo)}/repository/tree?recursive=true&per_page=100`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("GitLab API error response:", errorText);

        // Enhanced error handling with specific messages
        if (response.status === 401) {
          throw new Error("401 Unauthorized - Invalid or expired GitLab token");
        }

        if (response.status === 403) {
          throw new Error("403 Forbidden - Token doesn't have permission to access this repository");
        }

        if (response.status === 404) {
          throw new Error("404 Not Found - Repository not found");
        }

        if (response.status === 422) {
          throw new Error("422 Unprocessable Entity - Invalid repository or owner name");
        }

        if (response.status === 429) {
          throw new Error("429 Rate limit exceeded - Too many requests to GitLab API");
        }

        throw new Error(`GitLab API error: ${response.status} ${response.statusText}`);
      }

      const treeData = await response.json() as GitLabTreeItem[];
      const tree = this.buildNestedTree(treeData);
      return {
        repository: {
          name: repo,
          full_name: `${owner}/${repo}`,
          default_branch: default_branch, // Would need to fetch from separate API call
        },
        tree,
      };
    } catch (err: any) {
      console.error("Failed to fetch GitLab repository tree:", err.message || err);

      // Enhanced error handling with specific messages
      if (err.message?.includes('NetworkError') || err.message?.includes('fetch')) {
        return {
          error: true,
          message: "Network error - Unable to connect to GitLab API",
        };
      }

      if (err.message?.includes('JSON')) {
        return {
          error: true,
          message: "Invalid response from GitLab API",
        };
      }

      return {
        error: true,
        message: err.message || "Unknown error fetching GitLab repository tree",
      };
    }
  }

  private buildNestedTree(flatTree: GitLabTreeItem[]): FileTreeNode[] {
    const pathMap: Record<string, any[]> = {};

    flatTree.forEach((item) => {
      const parts = item.path.split("/");
      const fileName = parts.pop()!;
      const parentDir = parts.join("/");

      if (!pathMap[parentDir]) pathMap[parentDir] = [];

      if (item.type === "blob") {
        pathMap[parentDir].push({
          type: "file",
          name: fileName,
          path: item.path,
          sha: item.sha,
        });
      } else if (item.type === "tree") {
        pathMap[parentDir].push({
          type: "folder",
          name: fileName,
          path: item.path,
          children: [],
        });
      }
    });

    const sortAndAttach = (basePath: string): FileTreeNode[] => {
      const isSpecial = (name: string) => /^[^a-zA-Z0-9]/.test(name);

      const sortedItems = (pathMap[basePath] || []).sort((a, b) => {
        const aSpecial = isSpecial(a.name);
        const bSpecial = isSpecial(b.name);
        if (a.type === b.type) {
          if (aSpecial && !bSpecial) return -1;
          if (!aSpecial && bSpecial) return 1;
          return a.name.localeCompare(b.name);
        }
        return a.type === "folder" ? -1 : 1;
      });

      return sortedItems.map((item) => {
        if (item.type === "folder") {
          const newPath = basePath ? `${basePath}/${item.name}` : item.name;
          item.children = sortAndAttach(newPath);
        }
        return item;
      });
    };

    return sortAndAttach("");
  }
}

// Bitbucket-specific implementation (example)
export class BitbucketProvider implements GitProvider {
  async getRepositoryTree(owner: string, repo: string, token: string, default_branch: string): Promise<{
    repository?: any;
    tree?: FileTreeNode[];
    error?: boolean;
    message?: string;
  }> {
    try {
      // First, get the repository info to get the default branch
      const repoUrl = `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}`;
      const repoResp = await fetch(repoUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!repoResp.ok) {
        const errorText = await repoResp.text();
        console.error("Bitbucket: Repo error response:", errorText);

        // Enhanced error handling with specific messages
        if (repoResp.status === 401) {
          throw new Error("401 Unauthorized - Invalid or expired Bitbucket token");
        }

        if (repoResp.status === 403) {
          throw new Error("403 Forbidden - Token doesn't have permission to access this repository");
        }

        if (repoResp.status === 404) {
          throw new Error("404 Not Found - Repository not found");
        }

        if (repoResp.status === 422) {
          throw new Error("422 Unprocessable Entity - Invalid repository or owner name");
        }

        if (repoResp.status === 429) {
          throw new Error("429 Rate limit exceeded - Too many requests to Bitbucket API");
        }

        throw new Error(`Failed to fetch repo info: ${repoResp.status} ${repoResp.statusText}`);
      }

      const repoData = await repoResp.json() as any;
      const defaultBranch = default_branch;  /*repoData.mainbranch?.name */


      // Now get the source tree with the default branch
      const sourceUrl = `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}/src/${defaultBranch}/`;
      const response = await fetch(sourceUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Bitbucket: Source error response:", errorText);

        // Enhanced error handling with specific messages
        if (response.status === 401) {
          throw new Error("401 Unauthorized - Invalid or expired Bitbucket token");
        }

        if (response.status === 403) {
          throw new Error("403 Forbidden - Token doesn't have permission to access this repository");
        }

        if (response.status === 404) {
          throw new Error("404 Not Found - Repository source not found");
        }

        if (response.status === 422) {
          throw new Error("422 Unprocessable Entity - Invalid repository or owner name");
        }

        if (response.status === 429) {
          throw new Error("429 Rate limit exceeded - Too many requests to Bitbucket API");
        }

        throw new Error(`Bitbucket API error: ${response.status} ${response.statusText}`);
      }

      const treeData = await response.json() as BitbucketTreeResponse;
      // Recursively fetch all files and directories
      const allItems = await this.fetchAllItems(owner, repo, token, defaultBranch, treeData.values || []);
      const tree = this.buildNestedTree(allItems);
      return {
        repository: {
          name: repoData.name,
          full_name: `${owner}/${repo}`,
          default_branch: defaultBranch,
        },
        tree,
      };
    } catch (err: any) {
      console.error("Bitbucket error:", err.message);

      // Enhanced error handling with specific messages
      if (err.message?.includes('NetworkError') || err.message?.includes('fetch')) {
        return {
          error: true,
          message: "Network error - Unable to connect to Bitbucket API",
        };
      }

      if (err.message?.includes('JSON')) {
        return {
          error: true,
          message: "Invalid response from Bitbucket API",
        };
      }

      return {
        error: true,
        message: err.message || "Unknown error fetching Bitbucket repository tree"
      };
    }
  }

  private async fetchAllItems(
    owner: string,
    repo: string,
    token: string,
    branch: string,
    items: BitbucketTreeItem[]
  ): Promise<BitbucketTreeItem[]> {
    const allItems: BitbucketTreeItem[] = [];

    for (const item of items) {
      allItems.push(item);

      // If it's a directory, recursively fetch its contents
      if (item.type === 'commit_directory') {
        try {
          const dirUrl = `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}/src/${branch}/${item.path}/`;
          const dirResponse = await fetch(dirUrl, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });

          if (dirResponse.ok) {
            const dirData = await dirResponse.json() as BitbucketTreeResponse;
            const subItems = await this.fetchAllItems(owner, repo, token, branch, dirData.values || []);
            allItems.push(...subItems);
          } else {
            console.warn(`Bitbucket: Failed to fetch directory ${item.path}: ${dirResponse.status} ${dirResponse.statusText}`);
          }
        } catch (error) {
          console.warn(`Bitbucket: Error fetching directory ${item.path}:`, error);
        }
      }
    }

    return allItems;
  }

  private buildNestedTree(flatTree: BitbucketTreeItem[]): FileTreeNode[] {
    const pathMap: Record<string, FileTreeNode[]> = {};

    // Group items by their parent directory
    for (const item of flatTree) {
      const parts = item.path.split('/');
      const fileName = parts.pop()!;
      const parentDir = parts.join('/');

      if (!pathMap[parentDir]) {
        pathMap[parentDir] = [];
      }

      if (item.type === 'commit_file') {
        pathMap[parentDir].push({
          type: 'file',
          name: fileName,
          path: item.path
        });
      } else if (item.type === 'commit_directory') {
        pathMap[parentDir].push({
          type: 'folder',
          name: fileName,
          path: item.path,
          children: []
        });
      }
    }

    // Recursively build the tree structure
    const buildTree = (basePath: string): FileTreeNode[] => {
      const items = pathMap[basePath] || [];

      // Sort items: folders first, then files, alphabetically within each type
      const sortedItems = items.sort((a, b) => {
        if (a.type === b.type) {
          return a.name.localeCompare(b.name);
        }
        return a.type === 'folder' ? -1 : 1;
      });

      return sortedItems.map(item => {
        if (item.type === 'folder') {
          const newPath = basePath ? `${basePath}/${item.name}` : item.name;
          item.children = buildTree(newPath);
        }
        return item;
      });
    };

    return buildTree('');
  }
}

// Generic Git repository sync service
export class GitRepoSyncService {
  private codeFileRepository: DataSource;
  private providers: Map<string, GitProvider>;

  constructor(db: DataSource) {
    this.codeFileRepository = db;
    this.providers = new Map();

    // Register supported providers
    this.providers.set('GitHub', new GitHubProvider());
    this.providers.set('GitLab', new GitLabProvider());
    this.providers.set('Bitbucket', new BitbucketProvider());
    // TODO: Add Azure DevOps provider
    // this.providers.set('azure', new AzureDevOpsProvider());
  }

  public async syncRepoCodeFiles(request: GitProviderSyncInput): Promise<{ status: boolean; message: string }> {
    const { id: repoId, owner, repo, default_branch, token, created_user_id, provider } = request;

    // Enhanced validation with specific error messages
    if (!repoId) {
      return { status: false, message: "Repository ID is required." };
    }

    if (!owner || owner.trim() === '') {
      return { status: false, message: "Owner name is required and cannot be empty." };
    }

    if (!repo || repo.trim() === '') {
      return { status: false, message: "Repository name is required and cannot be empty." };
    }

    if (!token || token.trim() === '') {
      return { status: false, message: "Access token is required and cannot be empty." };
    }

    if (!default_branch || default_branch.trim() === '') {
      return { status: false, message: "default branch is required and cannot be empty." };
    }

    if (!provider) {
      return { status: false, message: "Git provider is required." };
    }

    // Validate owner name format (basic validation)
    if (!/^[a-zA-Z0-9_-]+$/.test(owner)) {
      return { status: false, message: "Invalid owner name format. Owner name can only contain letters, numbers, hyphens, and underscores." };
    }

    // Validate repository name format (basic validation)
    if (!/^[a-zA-Z0-9._-]+$/.test(repo)) {
      return { status: false, message: "Invalid repository name format. Repository name can only contain letters, numbers, dots, hyphens, and underscores." };
    }

    // Validate token format (basic validation for different providers)
    if (provider === 'GitLab' && !token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
      return { status: false, message: "Invalid GitHub token format. GitHub tokens should start with 'ghp_' or 'github_pat_'." };
    }

    if (provider === 'GitLab' && !token.startsWith('glpat-')) {
      return { status: false, message: "Invalid GitLab token format. GitLab tokens should start with 'glpat-'." };
    }
    console.log("222222222222222222222222222");

    const gitProvider = this.providers.get(provider);
    if (!gitProvider) {
      return { status: false, message: `Provider '${provider}' is not supported. Supported providers: ${Array.from(this.providers.keys()).join(', ')}` };
    }
    console.log("3333333333333333333333333");

    try {
      const repoData = await gitProvider.getRepositoryTree(owner, repo, token, default_branch);
      console.log("4444444444444444444444444444", repoData);


      // Check for specific API errors
      if (repoData.error) {
        const errorMessage = repoData.message || "Unknown error occurred";

        // Provide specific error messages based on common API errors
        if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
          return { status: false, message: "Invalid or expired access token. Please check your token and try again." };
        }

        if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
          return { status: false, message: "Access denied. The token doesn't have permission to access this repository." };
        }

        if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
          return { status: false, message: `Repository '${owner}/${repo}' not found. Please check the owner name and repository name.` };
        }

        if (errorMessage.includes('422') || errorMessage.includes('Unprocessable Entity')) {
          return { status: false, message: "Invalid branch or repository or owner name format." };
        }

        if (errorMessage.includes('rate limit') || errorMessage.includes('Rate limit')) {
          return { status: false, message: "API rate limit exceeded. Please try again later." };
        }

        return { status: false, message: `Failed to fetch repository: ${errorMessage}` };
      }
      console.log("555555555555555555555555");


      if (!repoData.tree) {
        return { status: false, message: `No repository structure found for '${owner}/${repo}'. The repository might be empty or inaccessible.` };
      }

      console.log("1111111111111", repoData.tree);
      const filePathsWithSHA = await this.getAllFilePathsWithSHA(repoData.tree);
      console.log("222222222222222222", filePathsWithSHA);
      const insertionResult = await this.storeFilePathsInDB(repoId, filePathsWithSHA, created_user_id);

      return insertionResult;
    } catch (err: any) {
      console.error(`Error syncing repository files from ${provider}:`, err.message || err);

      // Provide more specific error messages based on the caught error
      if (err.message?.includes('fetch')) {
        return { status: false, message: `Network error: Unable to connect to ${provider}. Please check your internet connection.` };
      }

      if (err.message?.includes('JSON')) {
        return { status: false, message: `Invalid response from ${provider} API. Please try again.` };
      }

      return {
        status: false,
        message: `Failed to sync code files from ${provider}: ${err.message || 'Unknown error occurred'}`,
      };
    }
  }

  private async storeFilePathsInDB(
    repositoryId: number,
    filePathsWithSHA: Array<{ path: string; sha: string }>,
    userId: number
  ): Promise<{ status: boolean; message: string }> {
    try {
      const codeFileRepo = this.codeFileRepository.getRepository(CodeFile);

      // Check for existing files to prevent duplicates
      const existingFiles = await codeFileRepo.find({
        where: { repository_id: repositoryId }
      });

      const existingPaths = new Set(existingFiles.map(file => file.file_link));
      const newFilePathsWithSHA = filePathsWithSHA.filter(file => !existingPaths.has(file.path));

      if (newFilePathsWithSHA.length === 0) {
        return { status: true, message: "All files already exist in database." };
      }

      const codeFileEntities = newFilePathsWithSHA.map((fileData) => {
        const file = new CodeFile();
        file.repository_id = repositoryId;
        file.file_link = fileData.path;
        file.file_sha = fileData.sha;
        file.created_user_id = userId;
        return file;
      });

      await codeFileRepo.save(codeFileEntities);

      return {
        status: true,
        message: `Code files saved successfully. Added ${newFilePathsWithSHA.length} new files.`
      };
    } catch (err: any) {
      console.error("Error saving files to DB:", err.message || err);
      return {
        status: false,
        message: "Failed to store code file paths in database.",
      };
    }
  }

  // private async getAllFilePathsFromTree(tree: FileTreeNode[]): Promise<string[]> {
  //   const filePaths: string[] = [];

  //   const traverse = (nodes: FileTreeNode[]) => {
  //     for (const node of nodes) {
  //       if (node.type === 'file') {
  //         filePaths.push(node.path);
  //       } else if (node.type === 'folder' && node.children) {
  //         traverse(node.children);
  //       }
  //     }
  //   };

  //   traverse(tree);
  //   return filePaths;
  // }

  // Resync repository to detect changes
  
  public async resyncRepository(repositoryId: number): Promise<{ 
    status: boolean; 
    message: string; 
    changes?: {
      added: string[];
      deleted: string[];
      modified: string[];
      moved: Array<{ from: string; to: string }>;
      totalFiles: number;
    }
  }> {
    try {
      const codeFileRepo = this.codeFileRepository.getRepository(CodeFile);
      const repositoryRepo = this.codeFileRepository.getRepository(require('../../models/Repository').Repository);

      // Get repository details
      const repository = await repositoryRepo.findOne({
        where: { id: repositoryId }
      });

      if (!repository) {
        return { status: false, message: "Repository not found." };
      }

      // Get current files from database
      const existingFiles = await codeFileRepo.find({
        where: { repository_id: repositoryId }
      });

      const existingFileMap = new Map<string, { id: number; sha?: string }>();
      existingFiles.forEach(file => {
        existingFileMap.set(file.file_link, { id: file.id, sha: file.file_sha });
      });

      console.log("existingFileMap",existingFileMap);

      // Get current files from Git provider
      const gitProvider = this.providers.get(repository.provider);
      if (!gitProvider) {
        return { status: false, message: `Provider '${repository.provider}' is not supported.` };
      }

      const repoData = await gitProvider.getRepositoryTree(
        repository.author_name,
        repository.name,
        repository.token_name,
        repository.default_branch
      );

      if (repoData.error) {
        return { status: false, message: `Failed to fetch repository: ${repoData.message}` };
      }

      if (!repoData.tree) {
        return { status: false, message: "No repository structure found." };
      }

      // Get current file paths and SHAs from Git
      const currentFiles = await this.getAllFilePathsWithSHA(repoData.tree);
      const currentFileMap = new Map<string, string>();
      currentFiles.forEach((file :any) => {
        currentFileMap.set(file.path, file.sha);
      });

      // Enhanced change detection with rename/move support
      const added: string[] = [];
      const deleted: string[] = [];
      const modified: string[] = [];
      const moved: Array<{ from: string; to: string }> = [];

      // Phase 1: Standard detection - Find added and modified files
      for (const [filePath, currentSHA] of currentFileMap.entries()) {
        const existingFile = existingFileMap.get(filePath);
        if (!existingFile) {
          // New file
          added.push(filePath);
        } else if (existingFile.sha && existingFile.sha !== currentSHA) {
          // Modified file
          modified.push(filePath);
        }
      }

      // Phase 2: Find deleted files and detect renames/moves
      for (const [filePath, existingFile] of existingFileMap.entries()) {
        if (!currentFileMap.has(filePath)) {
          // File exists in database but not in Git - check if it was moved/renamed
          const movedTo = this.findMovedFile(filePath, existingFile.sha, currentFileMap);
          if (movedTo) {
            // File was moved/renamed
            console.log(`Detected move/rename: ${filePath} → ${movedTo}`);
            moved.push({ from: filePath, to: movedTo });
          } else {
            // File was truly deleted
            console.log(`Detected deletion: ${filePath}`);
            deleted.push(filePath);
          }
        }
      }

      // Phase 3: Remove moved files from added list
      for (const move of moved) {
        const addedIndex = added.indexOf(move.to);
        if (addedIndex > -1) {
          added.splice(addedIndex, 1);
        }
      }

      // Update database
      const changes: {
        added: string[];
        deleted: string[];
        modified: string[];
        moved: Array<{ from: string; to: string }>;
        totalFiles: number;
      } = {
        added: [],
        deleted: [],
        modified: [],
        moved: [],
        totalFiles: currentFiles.length
      };

      // Add new files
      for (const filePath of added) {
        const sha = currentFileMap.get(filePath);
        if (sha) {
          const file = new CodeFile();
          file.repository_id = repositoryId;
          file.file_link = filePath;
          file.file_sha = sha;
          file.created_user_id = repository.created_user_id;
          await codeFileRepo.save(file);
          changes.added.push(filePath);
        }
      }

      // Update modified files
      for (const filePath of modified) {
        const sha = currentFileMap.get(filePath);
        if (sha) {
          await codeFileRepo.update(
            { repository_id: repositoryId, file_link: filePath },
            { file_sha: sha }
          );
          changes.modified.push(filePath);
        }
      }

      // Handle moved/renamed files
      for (const move of moved) {
        const sha = currentFileMap.get(move.to);
        if (sha) {
          // Update the file path in database
          await codeFileRepo.update(
            { repository_id: repositoryId, file_link: move.from },
            { file_link: move.to, file_sha: sha }
          );
          changes.moved.push(move);
          console.log(`Updated database: ${move.from} → ${move.to}`);
        }
      }

      // Delete truly removed files
      for (const filePath of deleted) {
        await codeFileRepo.delete({
          repository_id: repositoryId,
          file_link: filePath
        });
        changes.deleted.push(filePath);
      }

      // Update repository last sync timestamp
      await repositoryRepo.update(
        { id: repositoryId },
        { last_synced_at: new Date() }
      );

      const totalChanges = added.length + deleted.length + modified.length + moved.length;
      const message = totalChanges === 0 
        ? "Repository is up to date. No changes detected."
        : `Resync completed. Added: ${added.length}, Deleted: ${deleted.length}, Modified: ${modified.length}, Moved: ${moved.length} files.`;

      return {
        status: true,
        message,
        changes
      };

    } catch (err: any) {
      console.error(`Error resyncing repository ${repositoryId}:`, err.message || err);
      return {
        status: false,
        message: `Failed to resync repository: ${err.message || 'Unknown error occurred'}`
      };
    }
  }

  // Resync all repositories
  public async resyncAllRepositories(): Promise<{
    status: boolean;
    message: string;
    results: Array<{
      repositoryId: number;
      repositoryName: string;
      status: boolean;
      message: string;
      changes?: {
        added: string[];
        deleted: string[];
        modified: string[];
        moved: Array<{ from: string; to: string }>;
        totalFiles: number;
      };
    }>;
  }> {
    try {
      const repositoryRepo = this.codeFileRepository.getRepository(require('../../models/Repository').Repository);
      
      // Get all repositories
      const repositories = await repositoryRepo.find();
      
      const results = [];
      
      for (const repository of repositories) {
        try {
          const result = await this.resyncRepository(repository.id);
          results.push({
            repositoryId: repository.id,
            repositoryName: repository.name,
            status: result.status,
            message: result.message,
            changes: result.changes
          });
        } catch (error: any) {
          results.push({
            repositoryId: repository.id,
            repositoryName: repository.name,
            status: false,
            message: `Error: ${error.message}`
          });
        }
      }

      const successful = results.filter(r => r.status).length;
      const failed = results.filter(r => !r.status).length;

      return {
        status: true,
        message: `Resync completed for ${repositories.length} repositories. Successful: ${successful}, Failed: ${failed}`,
        results
      };

    } catch (err: any) {
      console.error('Error resyncing all repositories:', err.message || err);
      return {
        status: false,
        message: `Failed to resync repositories: ${err.message || 'Unknown error occurred'}`,
        results: []
      };
    }
  }

  // Helper method to find moved/renamed files based on content SHA
  private findMovedFile(
    originalPath: string, 
    originalSHA: string | undefined, 
    currentFileMap: Map<string, string>
  ): string | null {
    if (!originalSHA) return null;

    // Look for files with the same SHA (same content)
    for (const [filePath, currentSHA] of currentFileMap.entries()) {
      if (currentSHA === originalSHA && filePath !== originalPath) {
        // Found a file with same content but different path
        return filePath;
      }
    }

    // Enhanced detection: Check for similar filenames with same content
    const originalFileName = this.getFileName(originalPath);
    for (const [filePath, currentSHA] of currentFileMap.entries()) {
      const currentFileName = this.getFileName(filePath);
      if (currentSHA === originalSHA && currentFileName === originalFileName) {
        // Same filename and content - likely a move operation
        return filePath;
      }
    }

    return null;
  }

  // Helper method to extract filename from path
  private getFileName(filePath: string): string {
    return filePath.split('/').pop() || '';
  }

  // Helper method to get file paths with SHA values
  private async getAllFilePathsWithSHA(tree: FileTreeNode[]): Promise<Array<{ path: string; sha: string }>> {
    const files: Array<{ path: string; sha: string }> = [];

    const traverse = (nodes: FileTreeNode[]) => {
      for (const node of nodes) {
        if (node.type === 'file' && node.sha) {
          files.push({ path: node.path, sha: node.sha });
        } else if (node.type === 'folder' && node.children) {
          traverse(node.children);
        }
      }
    };

    traverse(tree);
    return files;
  }
}
