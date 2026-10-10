const fs = require('fs');
const path = require('path');

// 1. Web3 Icons
const web3Icons = {
  tokens: {},
  networks: {},
  wallets: {}
};

const tokenList = ['BTC', 'ETH', 'SOL', 'USDC', 'ARB', 'USDT'];
for (const sym of tokenList) {
  try {
    const mod = require(`../node_modules/@web3icons/core/dist/svgs/tokens/branded/${sym}.svg.js`);
    web3Icons.tokens[sym] = mod.default || mod;
  } catch (e) {
    console.warn('Could not load token', sym, e.message);
  }
}

// Hyperliquid / HYPE token from hyper-evm
try {
  const hyperEvm = require('../node_modules/@web3icons/core/dist/svgs/networks/branded/hyper-evm.svg.js');
  web3Icons.tokens['HYPE'] = hyperEvm.default || hyperEvm;
  web3Icons.networks['hyperliquid'] = hyperEvm.default || hyperEvm;
} catch (e) {
  console.warn('Could not load hyper-evm', e.message);
}

const networkMap = {
  'solana': 'solana',
  'arbitrum': 'arbitrum-one',
  'ethereum': 'ethereum'
};
for (const [key, file] of Object.entries(networkMap)) {
  try {
    const mod = require(`../node_modules/@web3icons/core/dist/svgs/networks/branded/${file}.svg.js`);
    web3Icons.networks[key] = mod.default || mod;
  } catch (e) {
    console.warn('Could not load network', key, e.message);
  }
}

const walletList = ['phantom', 'metamask', 'coinbase', 'rabby'];
for (const w of walletList) {
  try {
    const mod = require(`../node_modules/@web3icons/core/dist/svgs/wallets/branded/${w}.svg.js`);
    web3Icons.wallets[w] = mod.default || mod;
  } catch (e) {
    console.warn('Could not load wallet', w, e.message);
  }
}

// 2. MX Icons
const mxIcons = {};
const mxTargets = [
  { id: 'shieldSecurity', folder: 'shield-security', file: 'ShieldSecurityLinear.js' },
  { id: 'shieldSecurityBold', folder: 'shield-security', file: 'ShieldSecurityBold.js' },
  { id: 'shieldTick', folder: 'shield-tick', file: 'ShieldTickLinear.js' },
  { id: 'wallet', folder: 'wallet-2', file: 'Wallet2Linear.js' },
  { id: 'emptyWalletTick', folder: 'empty-wallet-tick', file: 'EmptyWalletTickLinear.js' },
  { id: 'activity', folder: 'activity', file: 'ActivityLinear.js' },
  { id: 'chart', folder: 'chart-2', file: 'Chart2Linear.js' },
  { id: 'convert', folder: 'convert', file: 'ConvertLinear.js' },
  { id: 'securitySafe', folder: 'security-safe', file: 'SecuritySafeLinear.js' },
  { id: 'lock', folder: 'lock', file: 'LockLinear.js' },
  { id: 'unlock', folder: 'unlock', file: 'UnlockLinear.js' },
  { id: 'receipt', folder: 'receipt-2', file: 'Receipt2Linear.js' },
  { id: 'flash', folder: 'flash', file: 'FlashLinear.js' },
  { id: 'refresh', folder: 'refresh-2', file: 'Refresh2Linear.js' },
  { id: 'documentCode', folder: 'document-code', file: 'DocumentCodeLinear.js' },
  { id: 'global', folder: 'global', file: 'GlobalLinear.js' },
  { id: 'tickCircle', folder: 'tick-circle', file: 'TickCircleLinear.js' },
  { id: 'infoCircle', folder: 'info-circle', file: 'InfoCircleLinear.js' },
  { id: 'closeCircle', folder: 'close-circle', file: 'CloseCircleLinear.js' },
  { id: 'copy', folder: 'document-copy', file: 'DocumentCopyLinear.js' },
  { id: 'eye', folder: 'eye', file: 'EyeLinear.js' },
  { id: 'search', folder: 'search-normal', file: 'SearchNormalLinear.js' },
  { id: 'arrowRight', folder: 'arrow-right', file: 'ArrowRightLinear.js' },
  { id: 'arrowDown', folder: 'arrow-down', file: 'ArrowDownLinear.js' },
  { id: 'setting', folder: 'setting-2', file: 'Setting2Linear.js' }
];

function extractSvgInnerFromJs(content) {
  const elements = [];
  const tagRegex = /jsx\(\s*\"([a-zA-Z0-9]+)\"\s*,\s*(\{[\s\S]*?\})\s*\)/g;
  let match;
  while ((match = tagRegex.exec(content)) !== null) {
    const tag = match[1];
    const propsRaw = match[2];
    
    const attrs = [];
    const attrRegex = /([a-zA-Z0-9_-]+)\s*:\s*(\"[^\"]*\"|[0-9.]+|props\.[a-zA-Z0-9]+)/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(propsRaw)) !== null) {
      let key = attrMatch[1];
      let val = attrMatch[2];
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      }
      const kebab = key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
      if (key === 'children' || key === 'className') continue;
      attrs.push(`${kebab}="${val}"`);
    }
    elements.push(`<${tag} ${attrs.join(' ')} />`);
  }
  return elements.join('\n    ');
}

for (const t of mxTargets) {
  const filePath = path.join(__dirname, '../node_modules/mx-icons/dist/components', t.folder, t.file);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    const inner = extractSvgInnerFromJs(content);
    mxIcons[t.id] = inner;
  } else {
    console.warn('MX icon file missing:', filePath);
  }
}

// Generate the standalone browser bundle
const bundleContent = `/**
 * Astra Protocol - Web3Icons & MX-Icons Unified Visual System
 * Sources:
 * - @web3icons/core (https://github.com/0xa3k5/web3icons)
 * - mx-icons (https://github.com/ig-imanish/mx-icons)
 */
(function(root) {
  const WEB3_ICONS = ${JSON.stringify(web3Icons, null, 2)};
  const MX_INNER = ${JSON.stringify(mxIcons, null, 2)};

  function formatSvg(svgString, size, className, style) {
    if (!svgString) return '';
    let out = svgString;
    if (size) {
      out = out.replace(/width="[^"]*"/, 'width="' + size + '"')
               .replace(/height="[^"]*"/, 'height="' + size + '"');
      if (!out.includes('width="')) {
        out = out.replace('<svg ', '<svg width="' + size + '" height="' + size + '" ');
      }
    }
    if (className) {
      out = out.replace('<svg ', '<svg class="' + className + '" ');
    }
    if (style) {
      out = out.replace('<svg ', '<svg style="' + style + '" ');
    }
    return out;
  }

  function renderMx(iconKey, { size = 20, color = 'currentColor', className = '', style = '' } = {}) {
    const inner = MX_INNER[iconKey];
    if (!inner) return '';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" class="mx-icon ' + className + '" style="color:' + color + ';' + style + '">' + inner + '</svg>';
  }

  const AstraIcons = {
    web3: {
      token: function(sym, size = 24, className = '', style = '') {
        const key = (sym || '').toUpperCase();
        return formatSvg(WEB3_ICONS.tokens[key] || '', size, 'web3-token-icon ' + className, style);
      },
      network: function(net, size = 24, className = '', style = '') {
        const key = (net || '').toLowerCase();
        return formatSvg(WEB3_ICONS.networks[key] || '', size, 'web3-network-icon ' + className, style);
      },
      wallet: function(wal, size = 24, className = '', style = '') {
        const key = (wal || '').toLowerCase();
        return formatSvg(WEB3_ICONS.wallets[key] || '', size, 'web3-wallet-icon ' + className, style);
      },
      raw: WEB3_ICONS
    },
    mx: {
      render: renderMx,
      raw: MX_INNER,
      shieldSecurity: (opts) => renderMx('shieldSecurity', opts),
      shieldSecurityBold: (opts) => renderMx('shieldSecurityBold', opts),
      shieldTick: (opts) => renderMx('shieldTick', opts),
      wallet: (opts) => renderMx('wallet', opts),
      emptyWalletTick: (opts) => renderMx('emptyWalletTick', opts),
      activity: (opts) => renderMx('activity', opts),
      chart: (opts) => renderMx('chart', opts),
      convert: (opts) => renderMx('convert', opts),
      securitySafe: (opts) => renderMx('securitySafe', opts),
      lock: (opts) => renderMx('lock', opts),
      unlock: (opts) => renderMx('unlock', opts),
      receipt: (opts) => renderMx('receipt', opts),
      flash: (opts) => renderMx('flash', opts),
      refresh: (opts) => renderMx('refresh', opts),
      documentCode: (opts) => renderMx('documentCode', opts),
      global: (opts) => renderMx('global', opts),
      tickCircle: (opts) => renderMx('tickCircle', opts),
      infoCircle: (opts) => renderMx('infoCircle', opts),
      closeCircle: (opts) => renderMx('closeCircle', opts),
      copy: (opts) => renderMx('copy', opts),
      eye: (opts) => renderMx('eye', opts),
      search: (opts) => renderMx('search', opts),
      arrowRight: (opts) => renderMx('arrowRight', opts),
      arrowDown: (opts) => renderMx('arrowDown', opts),
      setting: (opts) => renderMx('setting', opts)
    }
  };

  root.AstraIcons = AstraIcons;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AstraIcons;
  }
})(typeof window !== 'undefined' ? window : globalThis);
`;

const appDist = path.join(__dirname, '../../app/astra-icons.bundle.js');
const rootDist = path.join(__dirname, '../../astra-icons.bundle.js');

fs.writeFileSync(appDist, bundleContent, 'utf8');
fs.writeFileSync(rootDist, bundleContent, 'utf8');

console.log('Successfully generated AstraIcons bundle with Web3Icons and MX-Icons!');
console.log('App dist:', appDist, '(' + bundleContent.length + ' bytes)');
console.log('Root dist:', rootDist);
