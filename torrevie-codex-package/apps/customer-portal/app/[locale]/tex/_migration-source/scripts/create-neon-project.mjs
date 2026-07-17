const apiKey = process.env.NEON_API_KEY;
const projectName = process.env.NEON_PROJECT_NAME || 'torrevie-tex';
const databaseName = process.env.NEON_DATABASE_NAME || 'tex';
const branchName = process.env.NEON_BRANCH_NAME || 'main';
const orgId = process.env.NEON_ORG_ID;
const regionId = process.env.NEON_REGION_ID;

if (!apiKey) {
  console.error('NEON_API_KEY is required to create a Neon project.');
  process.exit(1);
}

async function neonApi(path, options = {}) {
  const response = await fetch(`https://console.neon.tech/api/v2${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers,
    },
  });

  const body = await response.text();
  const data = body ? JSON.parse(body) : {};

  if (!response.ok) {
    const message = data.message || data.error || response.statusText;
    throw new Error(`${response.status} ${message}`);
  }

  return data;
}

const projectPayload = {
  project: {
    name: projectName,
    ...(orgId ? { org_id: orgId } : {}),
    ...(regionId ? { region_id: regionId } : {}),
  },
};

console.log(`Creating Neon project "${projectName}"...`);
const created = await neonApi('/projects', {
  method: 'POST',
  body: JSON.stringify(projectPayload),
});

const projectId = created.project?.id;
const defaultBranchId = created.branch?.id || created.project?.default_branch_id;
const roleName = created.role?.name || created.roles?.[0]?.name;

if (!projectId) {
  throw new Error('Neon project was created but no project id was returned.');
}

console.log(`Project created: ${projectId}`);
if (defaultBranchId) console.log(`Default branch: ${defaultBranchId}`);

let branchId = defaultBranchId;
if (!branchId) {
  throw new Error('Neon project was created but no default branch id was returned.');
}

if (branchName !== 'main' && defaultBranchId) {
  console.log(`Creating branch "${branchName}" from the default branch...`);
  const branch = await neonApi(`/projects/${projectId}/branches`, {
    method: 'POST',
    body: JSON.stringify({
      branch: {
        name: branchName,
        parent_id: defaultBranchId,
      },
    }),
  });
  branchId = branch.branch?.id || branchId;
  if (branchId) console.log(`Migration branch: ${branchId}`);
}

console.log(`Creating database "${databaseName}"...`);
await neonApi(`/projects/${projectId}/branches/${branchId}/databases`, {
  method: 'POST',
  body: JSON.stringify({ database: { name: databaseName } }),
});

console.log('Neon project setup completed.');
console.log('Add the Neon connection string to DATABASE_URL before running npm run db:apply.');
if (roleName) console.log(`Use role "${roleName}" when generating the connection string.`);
