const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = (env = {}) => {
  const browser = env.browser || 'chrome';
  const manifestFile = browser === 'firefox' ? 'manifest.firefox.json' : 'manifest.json';
  const outDir = browser === 'firefox' ? 'dist-firefox' : 'dist';

  return {
    mode: 'production',
    entry: {
      background: './src/background.ts',
      content: './src/content.ts',
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.json$/,
          type: 'json',
        },
      ],
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
    },
    output: {
      filename: '[name].js',
      path: path.resolve(__dirname, outDir),
      clean: true,
    },
    plugins: [
      new CopyPlugin({
        patterns: [
          { from: manifestFile, to: 'manifest.json' },
          { from: 'popup.html', to: '.' },
          { from: 'popup.js', to: '.' },
          { from: 'options.html', to: '.' },
          { from: 'options.js', to: '.' },
          { from: 'ui-common.js', to: '.' },
          { from: 'ui.css', to: '.' },
          { from: 'icons/icon-*.png', to: 'icons/[name][ext]' },
        ],
      }),
    ],
    optimization: {
      minimize: false,
    },
  };
};
