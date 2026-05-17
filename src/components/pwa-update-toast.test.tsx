import { PwaUpdateToast } from "@/components/pwa-update-toast";
import { __testEmitUpdateReady, __testReset } from "@/lib/pwa/register";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Verifies the visible contract of the update toast: invisible by default,
// appears when an update is signalled, and the reload button triggers the
// wired SW activation. Acceptance criterion #4 of issue #25.

describe("PwaUpdateToast", () => {
  beforeEach(() => {
    __testReset();
  });

  it("renders nothing until an update is ready", () => {
    const { container } = render(<PwaUpdateToast />);
    expect(container.firstChild).toBeNull();
  });

  it("surfaces a reload affordance when an update is ready", () => {
    const trigger = vi.fn(async () => {});
    render(<PwaUpdateToast />);
    act(() => {
      __testEmitUpdateReady(trigger);
    });
    expect(screen.getByText(/neue version verfügbar/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /neu laden/i })).toBeInTheDocument();
  });

  it("invokes the SW activation trigger on reload click", async () => {
    const trigger = vi.fn(async () => {});
    render(<PwaUpdateToast />);
    act(() => {
      __testEmitUpdateReady(trigger);
    });
    const button = screen.getByRole("button", { name: /neu laden/i });
    await act(async () => {
      button.click();
    });
    expect(trigger).toHaveBeenCalledTimes(1);
    // Button label switches to a loading state after click.
    expect(screen.getByRole("button", { name: /lade neu/i })).toBeDisabled();
  });
});
