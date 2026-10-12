#!/usr/bin/env node
/*
 * 명세 JSON → 화면 XML / SP / 메타 등록값 생성
 * 사용: node tools/gen.js specs/CLS_SAMPLE.json [출력폴더]
 */
'use strict';
var fs = require('fs');
var path = require('path');
var WSGen = require('../assets/generator.js');

var specPath = process.argv[2];
if (!specPath) {
  console.error('사용: node tools/gen.js <명세.json> [출력폴더]');
  process.exit(1);
}
var root = path.join(__dirname, '..');
var cfgPath = path.join(root, 'config', 'ws-config.json');
var cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : null;
var spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
var res = WSGen.generate(spec, cfg);
var outDir = process.argv[3] || path.join(root, 'out', res.spec.info.screenId || path.basename(specPath, '.json'));

fs.mkdirSync(outDir, { recursive: true });
res.files.forEach(function (f) {
  fs.writeFileSync(path.join(outDir, f.name), f.content, 'utf8');
  console.log('생성: ' + path.join(outDir, f.name));
});
if (res.warnings.length) {
  console.log('\n확인 필요:');
  res.warnings.forEach(function (w) { console.log(' - ' + w); });
}
