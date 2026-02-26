import { useEffect, useState } from "preact/hooks";

import * as api from "../lib/api";
import { Navbar, NavbarItem, NavbarLabel, NavbarSection, NavbarSpacer } from "./navbar";

interface NavProps {
  onLogout: () => void;
}

export function Nav({ onLogout }: NavProps) {
  const [title, setTitle] = useState("bpodder");

  useEffect(() => {
    api.getUiConfig().then((config) => {
      setTitle(config.title);
    });
  }, []);

  return (
    <Navbar>
      <NavbarSection>
        <NavbarItem current href="/dashboard">
          <NavbarLabel>{title}</NavbarLabel>
        </NavbarItem>
      </NavbarSection>
      <NavbarSpacer />
      <NavbarSection>
        <NavbarItem onClick={onLogout}>Logout</NavbarItem>
      </NavbarSection>
    </Navbar>
  );
}
