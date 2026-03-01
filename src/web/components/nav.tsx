import { useUiConfig } from "../hooks/use-ui-config";
import { Navbar, NavbarItem, NavbarLabel, NavbarSection, NavbarSpacer } from "./navbar";

interface NavProps {
  onLogout: () => void;
}

export function Nav({ onLogout }: NavProps) {
  const { data: uiConfig } = useUiConfig();

  return (
    <Navbar>
      <NavbarSection>
        <NavbarItem current href="/dashboard">
          <NavbarLabel>{uiConfig?.title ?? "bpodder"}</NavbarLabel>
        </NavbarItem>
      </NavbarSection>
      <NavbarSpacer />
      <NavbarSection>
        <NavbarItem onClick={onLogout}>Logout</NavbarItem>
      </NavbarSection>
    </Navbar>
  );
}
