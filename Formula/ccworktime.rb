class Ccworktime < Formula
  desc "Calculate work time from Claude Code session logs"
  homepage "https://github.com/ShahadIshraq/ccworktime"
  version "0.0.1"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/ShahadIshraq/ccworktime/releases/download/v#{version}/ccworktime-darwin-arm64.tar.gz"
      sha256 "REPLACE_WITH_ACTUAL_SHA256"
    else
      url "https://github.com/ShahadIshraq/ccworktime/releases/download/v#{version}/ccworktime-darwin-x64.tar.gz"
      sha256 "REPLACE_WITH_ACTUAL_SHA256"
    end
  end

  on_linux do
    url "https://github.com/ShahadIshraq/ccworktime/releases/download/v#{version}/ccworktime-linux-x64.tar.gz"
    sha256 "REPLACE_WITH_ACTUAL_SHA256"
  end

  def install
    if OS.mac? && Hardware::CPU.arm?
      bin.install "ccworktime-darwin-arm64" => "ccworktime"
    elsif OS.mac?
      bin.install "ccworktime-darwin-x64" => "ccworktime"
    else
      bin.install "ccworktime-linux-x64" => "ccworktime"
    end
  end

  def caveats
    <<~EOS
      ccworktime reads session data from ~/.claude/
      Make sure Claude Code is installed: https://claude.ai/code
    EOS
  end

  test do
    assert_match "Usage:", shell_output("#{bin}/ccworktime --help")
    assert_match version.to_s, shell_output("#{bin}/ccworktime --version")
  end
end
