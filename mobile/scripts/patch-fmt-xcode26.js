#!/usr/bin/env node
/**
 * Patches react-native/scripts/react_native_pods.rb to add a fmt/Clang 17+ fix.
 *
 * Root cause: In C++20 mode, __cpp_consteval IS defined, so fmt/base.h sets
 * FMT_USE_CONSTEVAL=1, making fmt use `consteval` constructors. But non-constexpr
 * arguments are passed at call sites in format-inl.h, which Apple Clang 17+ rejects.
 *
 * Fix: Inject a post-install step inside react_native_post_install that adds an
 * override block to fmt/base.h forcing FMT_USE_CONSTEVAL=0 on Apple Clang 17+
 * (apple_build_version >= 17000000), regardless of which detection branch set it.
 *
 * This script runs as an npm postinstall hook so it survives expo prebuild's
 * full regeneration of the ios/ directory.
 */

const fs = require('fs');
const path = require('path');

const podRbPath = path.resolve(
  __dirname,
  '../node_modules/react-native/scripts/react_native_pods.rb'
);

if (!fs.existsSync(podRbPath)) {
  console.log('[patch-fmt] react_native_pods.rb not found — skipping');
  process.exit(0);
}

let content = fs.readFileSync(podRbPath, 'utf8');

const MARKER = '# [patch-fmt-xcode26] injected';
if (content.includes(MARKER)) {
  console.log('[patch-fmt] react_native_pods.rb already patched');
  process.exit(0);
}

// Target: the very last line of react_native_post_install, right before `end`
// We inject our Ruby code before the timing puts.
const NEEDLE = '  Pod::UI.puts "Pod install took #{Time.now.to_i - $START_TIME} [s] to run".green\nend';

if (!content.includes(NEEDLE)) {
  console.error('[patch-fmt] ERROR: needle not found in react_native_pods.rb — patch skipped');
  console.error('[patch-fmt] Needle was:', JSON.stringify(NEEDLE));
  process.exit(0); // non-fatal: build may still work or fail with a clear error
}

// Ruby code to inject (indented to match the surrounding function body)
const INJECTION = `  ${MARKER}
  begin
    require 'fileutils'
    fmt_base_h = "#{installer.sandbox.root}/fmt/include/fmt/base.h"
    if File.exist?(fmt_base_h)
      FileUtils.chmod('u+w', fmt_base_h)
      src = File.read(fmt_base_h)
      patch_marker = '// [patch-fmt-xcode26] FMT_USE_CONSTEVAL=0 on Apple Clang 17+'
      unless src.include?(patch_marker)
        # Inject override block right before the #if FMT_USE_CONSTEVAL usage section.
        # This forces FMT_USE_CONSTEVAL=0 on Apple Clang 17+ regardless of which
        # branch in the detection ladder (including __cpp_consteval) set it to 1.
        usage = "#if FMT_USE_CONSTEVAL\\n#  define FMT_CONSTEVAL consteval"
        override = "#{patch_marker}\\n" \\
                   "#if defined(__apple_build_version__) && __apple_build_version__ >= 17000000L\\n" \\
                   "#  undef FMT_USE_CONSTEVAL\\n" \\
                   "#  define FMT_USE_CONSTEVAL 0\\n" \\
                   "#endif\\n"
        if src.include?(usage)
          File.write(fmt_base_h, src.sub(usage, override + usage))
          Pod::UI.puts '[patch-fmt-xcode26] Patched fmt/base.h: FMT_USE_CONSTEVAL=0 for Apple Clang 17+'
        else
          Pod::UI.warn '[patch-fmt-xcode26] WARNING: usage needle not found in fmt/base.h'
        end
      end
    end
  rescue => e
    Pod::UI.warn "[patch-fmt-xcode26] ERROR: #{e.class}: #{e.message}"
  end

`;

const patched = content.replace(NEEDLE, INJECTION + NEEDLE);
fs.writeFileSync(podRbPath, patched);
console.log('[patch-fmt] Patched react_native_pods.rb for fmt/Clang 17+ (Xcode 26) fix');
