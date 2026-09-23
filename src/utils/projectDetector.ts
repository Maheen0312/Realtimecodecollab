import { ProjectFile } from '../types';

export interface DetectedProjectInfo {
  name: string;
  framework: string;
  projectType: 'react-vite' | 'next' | 'vue' | 'node' | 'python' | 'cpp' | 'java' | 'rust' | 'go' | 'static' | 'generic';
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun' | 'pip' | 'unknown';
  hasPackageJson: boolean;
  scripts: { name: string; command: string; description?: string }[];
  primaryRunCommand: string;
  description: string;
  recommendedAction?: string;
  entryPoint?: string;
  hasDevScript: boolean;
  hasStartScript: boolean;
  hasBuildScript: boolean;
}

export function detectProject(
  files: { name: string; path?: string; content?: string; isFolder?: boolean }[],
  activeFilePath?: string
): DetectedProjectInfo {
  let name = 'workspace';
  let framework = 'Generic';
  let projectType: DetectedProjectInfo['projectType'] = 'generic';
  let packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun' | 'pip' | 'unknown' = 'npm';
  const scripts: { name: string; command: string; description?: string }[] = [];
  let hasPackageJson = false;
  let hasDevScript = false;
  let hasStartScript = false;
  let hasBuildScript = false;
  let primaryRunCommand = '';
  let description = '';
  let entryPoint = '';

  const fileMap = new Map<string, { name: string; path?: string; content?: string; isFolder?: boolean }>();
  for (const f of files) {
    fileMap.set(f.name, f);
    if (f.path) fileMap.set(f.path, f);
  }

  // 1. Detect package manager from lock files
  if (fileMap.has('bun.lock') || fileMap.has('bun.lockb')) {
    packageManager = 'bun';
  } else if (fileMap.has('pnpm-lock.yaml')) {
    packageManager = 'pnpm';
  } else if (fileMap.has('yarn.lock')) {
    packageManager = 'yarn';
  } else if (fileMap.has('package-lock.json')) {
    packageManager = 'npm';
  } else if (fileMap.has('requirements.txt') || fileMap.has('pyproject.toml') || fileMap.has('Pipfile')) {
    packageManager = 'pip';
  }

  // 2. Parse package.json if present
  const pkgFile = fileMap.get('package.json');
  if (pkgFile && pkgFile.content) {
    hasPackageJson = true;
    try {
      const parsed = JSON.parse(pkgFile.content);
      if (parsed.name && typeof parsed.name === 'string') {
        name = parsed.name;
      }

      const allDeps = {
        ...(parsed.dependencies || {}),
        ...(parsed.devDependencies || {}),
      };

      const hasViteConfig = Array.from(fileMap.keys()).some(
        (k) => k === 'vite.config.js' || k === 'vite.config.ts' || k === 'vite.config.mjs' || k === 'vite.config.cjs'
      );
      const hasNextConfig = Array.from(fileMap.keys()).some(
        (k) => k === 'next.config.js' || k === 'next.config.ts' || k === 'next.config.mjs'
      );

      // Determine framework and project type
      if (hasNextConfig || allDeps['next']) {
        framework = 'Next.js';
        projectType = 'next';
      } else if (hasViteConfig || allDeps['vite']) {
        if (allDeps['react']) {
          framework = 'React + Vite';
          projectType = 'react-vite';
        } else if (allDeps['vue']) {
          framework = 'Vue + Vite';
          projectType = 'vue';
        } else {
          framework = 'Vite';
          projectType = 'react-vite';
        }
      } else if (allDeps['react']) {
        framework = 'React';
        projectType = 'react-vite';
      } else if (allDeps['vue']) {
        framework = 'Vue';
        projectType = 'vue';
      } else if (allDeps['express']) {
        framework = 'Express.js';
        projectType = 'node';
      } else {
        framework = 'Node.js';
        projectType = 'node';
      }

      const pmRunPrefix =
        packageManager === 'yarn' ? 'yarn ' :
        packageManager === 'pnpm' ? 'pnpm ' :
        packageManager === 'bun' ? 'bun run ' : 'npm run ';

      const pkgScripts: Record<string, string> = parsed.scripts || {};

      // Inspect existing scripts
      if (pkgScripts.dev) {
        hasDevScript = true;
        scripts.push({
          name: 'dev',
          command: `${pmRunPrefix}dev`,
          description: 'Start development server',
        });
      }

      if (pkgScripts.start) {
        hasStartScript = true;
        const startCmd =
          packageManager === 'yarn' ? 'yarn start' :
          packageManager === 'pnpm' ? 'pnpm start' :
          packageManager === 'bun' ? 'bun start' : 'npm start';

        scripts.push({
          name: 'start',
          command: startCmd,
          description: 'Start production / project server',
        });
      }

      if (pkgScripts.build) {
        hasBuildScript = true;
        scripts.push({
          name: 'build',
          command: `${pmRunPrefix}build`,
          description: 'Build production bundle',
        });
      }

      if (pkgScripts.preview) {
        scripts.push({
          name: 'preview',
          command: `${pmRunPrefix}preview`,
          description: 'Preview production build locally',
        });
      }

      if (pkgScripts.test) {
        const testCmd =
          packageManager === 'yarn' ? 'yarn test' :
          packageManager === 'pnpm' ? 'pnpm test' :
          packageManager === 'bun' ? 'bun test' : 'npm test';

        scripts.push({
          name: 'test',
          command: testCmd,
          description: 'Run project tests',
        });
      }

      // Collect other custom scripts defined in package.json
      for (const [sName] of Object.entries(pkgScripts)) {
        if (!['dev', 'start', 'build', 'preview', 'test'].includes(sName)) {
          scripts.push({
            name: sName,
            command: `${pmRunPrefix}${sName}`,
            description: `Run custom script: ${sName}`,
          });
        }
      }

      // CRITICAL: Determine primary run command without hardcoding or executing JSX directly
      // 1. If dev script exists, prefer dev
      if (hasDevScript) {
        primaryRunCommand = `${pmRunPrefix}dev`;
        description = `${framework} Development Server (${primaryRunCommand})`;
      } 
      // 2. Else if start script exists
      else if (hasStartScript) {
        const rawStart = pkgScripts.start || '';
        // If rawStart attempts to execute a .jsx or .tsx file directly with node (e.g. node src/App.jsx)
        if (/\bnode\s+.*\.(jsx|tsx)\b/i.test(rawStart)) {
          // This is a known malformed script. If vite is available or project is React/Vite, prefer build/preview or vite dev
          if (hasBuildScript) {
            primaryRunCommand = `${pmRunPrefix}build`;
            description = `React Bundle Build (${primaryRunCommand}) [start script incorrectly targets .jsx]`;
          } else {
            primaryRunCommand = 'npx vite';
            description = `Vite Development Server (npx vite)`;
          }
        } else {
          primaryRunCommand = packageManager === 'npm' ? 'npm start' : `${packageManager} start`;
          description = `Project Start Script (${primaryRunCommand})`;
        }
      } 
      // 3. Else if build script exists
      else if (hasBuildScript) {
        primaryRunCommand = `${pmRunPrefix}build`;
        description = `Project Build (${primaryRunCommand})`;
      } 
      // 4. Else check for server entrypoint (server.js, index.js, app.js)
      else {
        const serverFile = files.find(
          (f) => !f.isFolder && (f.name === 'server.js' || f.name === 'index.js' || f.name === 'app.js' || f.name === 'main.js')
        );
        if (serverFile) {
          entryPoint = serverFile.path || serverFile.name;
          primaryRunCommand = `node ${entryPoint}`;
          description = `Node.js Server (${primaryRunCommand})`;
        } else if (scripts.length > 0) {
          primaryRunCommand = scripts[0].command;
          description = `Project Script (${primaryRunCommand})`;
        }
      }
    } catch (e) {
      console.warn('Failed to parse package.json:', e);
    }
  }

  // 3. Detect Python project
  if (!hasPackageJson) {
    const pyFiles = files.filter((f) => !f.isFolder && f.name.endsWith('.py'));
    if (pyFiles.length > 0 || fileMap.has('requirements.txt') || fileMap.has('pyproject.toml')) {
      framework = 'Python';
      projectType = 'python';
      packageManager = 'pip';

      if (fileMap.has('requirements.txt')) {
        scripts.push({
          name: 'install',
          command: 'pip install -r requirements.txt',
          description: 'Install Python requirements',
        });
      }

      const mainPy =
        pyFiles.find((f) => f.name === 'main.py' || f.name === 'app.py' || f.name === 'server.py') ||
        (activeFilePath && activeFilePath.endsWith('.py') ? fileMap.get(activeFilePath) : null) ||
        pyFiles[0];

      if (mainPy) {
        entryPoint = mainPy.path || mainPy.name;
        primaryRunCommand = `python3 "${entryPoint}"`;
        description = `Python Application (python3 ${entryPoint})`;
        scripts.push({
          name: 'run',
          command: primaryRunCommand,
          description: 'Execute Python entry point',
        });
      }
    }
  }

  // 4. Detect C / C++ project
  if (!hasPackageJson && projectType === 'generic') {
    const hasCpp = files.some((f) => !f.isFolder && (f.name.endsWith('.cpp') || f.name.endsWith('.c')));
    if (hasCpp || fileMap.has('Makefile') || fileMap.has('CMakeLists.txt')) {
      framework = 'C/C++';
      projectType = 'cpp';

      if (fileMap.has('Makefile')) {
        primaryRunCommand = 'make && ./main';
        description = 'Build & Run via Makefile';
      } else {
        const cppFile = files.find((f) => !f.isFolder && (f.name === 'main.cpp' || f.name === 'main.c')) ||
          files.find((f) => !f.isFolder && (f.name.endsWith('.cpp') || f.name.endsWith('.c')));
        if (cppFile) {
          entryPoint = cppFile.path || cppFile.name;
          const compiler = entryPoint.endsWith('.cpp') ? 'g++' : 'gcc';
          primaryRunCommand = `${compiler} "${entryPoint}" -o main && ./main`;
          description = `Compile and run C/C++ (${compiler})`;
        }
      }
      if (primaryRunCommand) {
        scripts.push({ name: 'compile & run', command: primaryRunCommand, description });
      }
    }
  }

  // 5. Detect Java project
  if (!hasPackageJson && projectType === 'generic') {
    const hasJava = files.some((f) => !f.isFolder && f.name.endsWith('.java'));
    if (hasJava || fileMap.has('pom.xml') || fileMap.has('build.gradle') || fileMap.has('gradlew')) {
      framework = 'Java';
      projectType = 'java';

      if (fileMap.has('gradlew')) {
        primaryRunCommand = './gradlew run';
        description = 'Gradle Wrapper Run';
      } else if (fileMap.has('pom.xml')) {
        primaryRunCommand = 'mvn compile exec:java';
        description = 'Maven Java Run';
      } else {
        const mainJava = files.find((f) => !f.isFolder && (f.name === 'Main.java' || f.name.endsWith('.java')));
        if (mainJava) {
          entryPoint = mainJava.path || mainJava.name;
          primaryRunCommand = `javac "${entryPoint}" && java "${entryPoint.replace(/\.java$/, '')}"`;
          description = 'Compile and run Java class';
        }
      }
      if (primaryRunCommand) {
        scripts.push({ name: 'run', command: primaryRunCommand, description });
      }
    }
  }

  // 6. Detect Rust project
  if (!hasPackageJson && projectType === 'generic' && fileMap.has('Cargo.toml')) {
    framework = 'Rust';
    projectType = 'rust';
    primaryRunCommand = 'cargo run';
    description = 'Cargo Rust Application';
    scripts.push({ name: 'run', command: primaryRunCommand, description });
  }

  // 7. Detect Go project
  if (!hasPackageJson && projectType === 'generic' && (fileMap.has('go.mod') || files.some((f) => f.name.endsWith('.go')))) {
    framework = 'Go';
    projectType = 'go';
    primaryRunCommand = 'go run .';
    description = 'Go Application (go run .)';
    scripts.push({ name: 'run', command: primaryRunCommand, description });
  }

  // 8. Static Web (index.html present with no backend)
  if (!hasPackageJson && projectType === 'generic' && fileMap.has('index.html')) {
    framework = 'HTML5 / Web';
    projectType = 'static';
    primaryRunCommand = 'preview';
    description = 'Static HTML5 document (Live in Browser Preview)';
  }

  // 9. If active file is specified and is a standalone script (e.g. script.py, server.js)
  if (activeFilePath) {
    const ext = activeFilePath.split('.').pop()?.toLowerCase();
    // Python script
    if (ext === 'py') {
      primaryRunCommand = `python3 "${activeFilePath}"`;
      description = `Execute active Python script (${activeFilePath})`;
    } 
    // Standalone JS (not JSX, and not a React app component)
    else if ((ext === 'js' || ext === 'mjs' || ext === 'cjs') && projectType !== 'react-vite' && projectType !== 'next') {
      primaryRunCommand = `node "${activeFilePath}"`;
      description = `Execute active JavaScript script (${activeFilePath})`;
    } 
    // TypeScript script (tsx)
    else if ((ext === 'ts') && projectType !== 'react-vite' && projectType !== 'next') {
      primaryRunCommand = `npx tsx "${activeFilePath}"`;
      description = `Execute active TypeScript file (${activeFilePath})`;
    }
    // CRITICAL SAFETY RULE #7: If active file is .jsx or .tsx
    else if (ext === 'jsx' || ext === 'tsx') {
      // NEVER run `node <file.jsx>`!
      if (!primaryRunCommand) {
        primaryRunCommand = hasDevScript ? `${packageManager === 'npm' ? 'npm run ' : `${packageManager} `}dev` : 'npx vite';
        description = `${framework} Development Server [JSX/TSX requires bundler]`;
      }
    }
  }

  // Fallback if still no primary command
  if (!primaryRunCommand) {
    if (scripts.length > 0) {
      primaryRunCommand = scripts[0].command;
      description = `Default Script (${primaryRunCommand})`;
    } else {
      primaryRunCommand = 'help';
      description = 'Terminal Help';
    }
  }

  return {
    name,
    framework,
    projectType,
    packageManager,
    hasPackageJson,
    scripts,
    primaryRunCommand,
    description,
    entryPoint,
    hasDevScript,
    hasStartScript,
    hasBuildScript,
  };
}

