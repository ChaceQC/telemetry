from pathlib import Path

from app.core.config import Settings


def test_default_port_is_project_backend_port(monkeypatch) -> None:
    monkeypatch.delenv("BACKEND_PORT", raising=False)
    monkeypatch.delenv("PORT", raising=False)

    settings = Settings()

    assert settings.port == 28117


def test_backend_port_reads_from_environment(monkeypatch) -> None:
    monkeypatch.setenv("BACKEND_PORT", "28118")

    settings = Settings()

    assert settings.port == 28118


def test_backend_port_takes_precedence_over_port(monkeypatch) -> None:
    monkeypatch.setenv("PORT", "30000")
    monkeypatch.setenv("BACKEND_PORT", "28119")

    settings = Settings()

    assert settings.port == 28119


def test_port_reads_from_environment_when_backend_port_is_missing(monkeypatch) -> None:
    monkeypatch.delenv("BACKEND_PORT", raising=False)
    monkeypatch.setenv("PORT", "28120")

    settings = Settings()

    assert settings.port == 28120


def test_version_file_declares_initial_backend_version(monkeypatch) -> None:
    monkeypatch.delenv("APP_VERSION", raising=False)
    version_file = Path(__file__).resolve().parents[1] / "VERSION"
    settings = Settings()

    assert version_file.read_text(encoding="utf-8").strip() == "0.1.0"
    assert settings.app_version == "0.1.0"
