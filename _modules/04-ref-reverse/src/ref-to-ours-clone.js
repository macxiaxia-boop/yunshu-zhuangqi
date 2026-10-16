// ref-to-ours-clone.js — REF 克隆 ZIP → yunshu-zhuangqi ours 克隆 ZIP
// 两阶段: inspect → reconfigure → export

'use strict';

const JSZip = require('jszip');

class CloneZipError extends Error {
  constructor(message, code = 'CLONE_ZIP_ERROR', details = {}) {
    super(message);
    this.name = 'CloneZipError';
    this.code = code;
    this.details = details;
  }
}

const REF_FILE_TYPE = 'QUOTATION_STUDIO_CLONE';
const OURS_FILE_TYPE = 'YUNSHU_ZHUANGQI_CLONE';
const REF_MIN_APP_VERSION = '3.0.1';
const OURS_MIN_APP_VERSION = '0.5.0';

async function sha256HexOfBytes(bytes) {
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function inspectRefClone(uint8Array) {
  const zip = await JSZip.loadAsync(uint8Array);
  const manifestText = await zip.file('manifest.json').async('string');
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch (e) {
    throw new CloneZipError('Invalid manifest.json: ' + e.message, 'INVALID_MANIFEST_JSON');
  }
  if (manifest.format !== REF_FILE_TYPE) {
    throw new CloneZipError(
      `Not a REF clone ZIP, format=${manifest.format}`,
      'NOT_REF_CLONE',
      { format: manifest.format }
    );
  }
  if (!manifest.sha256) {
    throw new CloneZipError('Manifest missing sha256', 'MISSING_SHA256');
  }
  // 校验 configuration.json 的 SHA256
  const configFile = zip.file('configuration.json');
  if (!configFile) {
    throw new CloneZipError('Missing configuration.json in clone ZIP', 'MISSING_CONFIG');
  }
  const configBytes = await configFile.async('uint8array');
  const actualSha = await sha256HexOfBytes(configBytes);
  if (actualSha !== manifest.sha256) {
    throw new CloneZipError(
      `SHA256 mismatch: expected ${manifest.sha256}, got ${actualSha}`,
      'SHA256_MISMATCH',
      { expected: manifest.sha256, actual: actualSha }
    );
  }
  let configuration;
  try {
    configuration = JSON.parse(new TextDecoder('utf-8').decode(configBytes));
  } catch (e) {
    throw new CloneZipError('Invalid configuration.json: ' + e.message, 'INVALID_CONFIG_JSON');
  }
  return { zip, manifest, configuration, configBytes };
}

function refToOursConfiguration(refConfig) {
  // 将 REF 数据重映射为 ours 数据
  return {
    fileType: OURS_FILE_TYPE,
    formatVersion: 1,
    schema: 1,
    company: refConfig.company || '云数',
    projectInfo: refConfig.projectInfo || (refConfig.data && refConfig.data.projectInfo) || {},
    categories: refConfig.categories || (refConfig.data && refConfig.data.categories) || [],
    libCategories: refConfig.libCategories || (refConfig.data && refConfig.data.libCategories) || [],
    quotas: refConfig.quotas || [],
    template: refConfig.template || {},
    notes: refConfig.notes || '',
    migratedFrom: {
      origin: 'ref',
      refFileType: REF_FILE_TYPE,
      refVersion: (refConfig.version || 1),
      migratedAt: new Date().toISOString(),
    },
  };
}

async function buildOursCloneZip(oursConfiguration) {
  const zip = new JSZip();
  const configText = JSON.stringify(oursConfiguration, null, 2);
  const configBytes = new TextEncoder().encode(configText);
  await zip.file('configuration.json', configBytes);
  const sha256 = await sha256HexOfBytes(configBytes);
  const manifest = {
    format: OURS_FILE_TYPE,
    schema: 1,
    appVersion: '0.5.0',
    minAppVersion: OURS_MIN_APP_VERSION,
    createdAt: new Date().toISOString(),
    company: oursConfiguration.company || '云数',
    sha256,
    contents: {
      projectInfo: !!oursConfiguration.projectInfo,
      categories: Array.isArray(oursConfiguration.categories),
      quotas: Array.isArray(oursConfiguration.quotas),
      template: !!oursConfiguration.template,
    },
  };
  await zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  await zip.file('使用说明.txt',
    'yunshu-zhuangqi 克隆配置包\n' +
    `minAppVersion: ${OURS_MIN_APP_VERSION}\n` +
    `format: ${OURS_FILE_TYPE}\n` +
    `创建时间: ${manifest.createdAt}\n`
  );
  return await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

async function convertRefCloneZip(uint8Array) {
  if (!uint8Array || !(uint8Array instanceof Uint8Array)) {
    throw new CloneZipError('uint8Array required', 'MISSING_INPUT');
  }
  if (uint8Array.byteLength > 45 * 1024 * 1024) {
    throw new CloneZipError(
      `Clone ZIP too large: ${uint8Array.byteLength} > 45MB`,
      'CLONE_TOO_LARGE'
    );
  }
  const { zip, manifest, configuration } = await inspectRefClone(uint8Array);
  // 附加 manifest 中的 contents (categories/quotas/template 标记) 来自 ref
  const oursConfig = refToOursConfiguration(configuration);
  if (manifest.contents) {
    oursConfig._refContents = manifest.contents;
  }
  return await buildOursCloneZip(oursConfig);
}

module.exports = {
  convertRefCloneZip,
  inspectRefClone,
  refToOursConfiguration,
  buildOursCloneZip,
  CloneZipError,
  REF_FILE_TYPE,
  OURS_FILE_TYPE,
  REF_MIN_APP_VERSION,
  OURS_MIN_APP_VERSION,
};
