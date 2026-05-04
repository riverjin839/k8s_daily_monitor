module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh', 'jsx-a11y'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],

    /* a11y — 운영 도구 키보드 우선 (DESIGN_SYSTEM §0).
       recommended 가 잡는 진짜 버그(빈 aria, label-without-control, 잘못된 role)는 error 유지.
       div onClick 같은 부분-위반은 점진 처리 위해 warn 으로 강등. */
    'jsx-a11y/click-events-have-key-events': 'warn',
    'jsx-a11y/no-static-element-interactions': 'warn',
    'jsx-a11y/no-noninteractive-element-interactions': 'warn',
    /* 한국어 lang 처리는 페이지 단위에서 따로 — autofix 충돌 방지로 off */
    'jsx-a11y/lang': 'off',
    /* autoFocus — 본 코드베이스의 모든 사용처가 사용자 트리거(모달 열기 /
       인라인 편집 시작 / "추가" 버튼) 직후의 첫 입력에 한정.
       no-autofocus 가 우려하는 "페이지 로드 시 예상치 못한 포커스 이동"
       시나리오가 없어 off. 새 코드에서는 항상 사용자 액션 직후에만 사용. */
    'jsx-a11y/no-autofocus': 'off',
  },
};
