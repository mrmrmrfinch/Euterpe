module.exports = {
    'env': {
        'browser': true,
        'es2021': true,
    },
    'extends': [
        'google',
        'plugin:vue/vue3-essential',
    ],
    'overrides': [
        {
            'env': {
                'node': true,
            },
            'files': [
                '.eslintrc.{js,cjs}',
            ],
            'parserOptions': {
                'sourceType': 'script',
            },
        },
    ],
    'parserOptions': {
        'ecmaVersion': 'latest',
        'sourceType': 'module',
    },
    'plugins': [
        'vue',
    ],
    'ignorePatterns': ['public/libraries/**/*', '**/checkpoints/**/*'],
    'rules': {
        'indent': ['error', 4],
        'max-len': ['error', {'code': 100}],
    },
};
