"use server";

import { mockStaff } from "@/lib/mock/staff";
import type {
  Staff,
  CreateStaffInput,
  UpdateStaffInput,
  ChangeRoleInput,
} from "@/features/staff/types";

type ActionResult = { success: true } | { success: false; error: string };

const ROLE_WEIGHT: Record<Staff["systemRole"], number> = {
  Admin: 0,
  DeputyHead: 1,
  HOD: 2,
  Teacher: 3,
};

export async function listStaffAction(): Promise<Staff[]> {
  if (process.env.USE_MOCK_DATA === "true") {
    return mockStaff
      .slice()
      .sort((a, b) => {
        const weightDiff = ROLE_WEIGHT[a.systemRole] - ROLE_WEIGHT[b.systemRole];
        if (weightDiff !== 0) return weightDiff;
        return a.lastName.localeCompare(b.lastName);
      });
  }
  return [];
}

export async function createStaffAction(
  data: CreateStaffInput
): Promise<
  | { success: true; id: string; inviteLink: string }
  | { success: false; error: string }
> {
  if (process.env.USE_MOCK_DATA === "true") {
    if (mockStaff.some((s) => s.email === data.email)) {
      return { success: false, error: "Email already registered." };
    }

    if (data.systemRole !== "Admin" && !data.division) {
      return { success: false, error: "Division is required for this role." };
    }

    const id = `STAFF-${String(mockStaff.length + 1).padStart(3, "0")}`;
    const newStaff: Staff = {
      id,
      schoolId: "school-uhas-001",
      firstName: data.firstName,
      lastName: data.lastName,
      rank: data.rank,
      systemRole: data.systemRole,
      division: data.division ?? null,
      phone: data.phone,
      email: data.email,
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    mockStaff.push(newStaff);

    return {
      success: true,
      id,
      inviteLink: `/invite?token=${id}`,
    };
  }

  return { success: false, error: "DB not connected" };
}

export async function updateStaffAction(
  id: string,
  data: UpdateStaffInput
): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA === "true") {
    const staff = mockStaff.find((s) => s.id === id);
    if (!staff) {
      return { success: false, error: "Staff not found." };
    }

    if (data.firstName !== undefined) staff.firstName = data.firstName;
    if (data.lastName !== undefined) staff.lastName = data.lastName;
    if (data.rank !== undefined) staff.rank = data.rank;
    if (data.phone !== undefined) staff.phone = data.phone;
    if (data.email !== undefined) staff.email = data.email;

    return { success: true };
  }

  return { success: false, error: "DB not connected" };
}

export async function changeRoleAction(
  id: string,
  data: ChangeRoleInput
): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA === "true") {
    const staff = mockStaff.find((s) => s.id === id);
    if (!staff) {
      return { success: false, error: "Staff not found." };
    }

    if (data.systemRole !== "Admin" && !data.division) {
      return { success: false, error: "Division is required for this role." };
    }

    staff.systemRole = data.systemRole;

    if (data.systemRole === "Admin") {
      staff.division = null;
    } else {
      staff.division = data.division ?? null;
    }

    return { success: true };
  }

  return { success: false, error: "DB not connected" };
}

export async function deactivateStaffAction(id: string): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA === "true") {
    const staff = mockStaff.find((s) => s.id === id);
    if (!staff) {
      return { success: false, error: "Staff not found." };
    }

    if (!staff.isActive) {
      return { success: false, error: "Staff member is already inactive." };
    }

    staff.isActive = false;
    return { success: true };
  }

  return { success: false, error: "DB not connected" };
}

export async function reactivateStaffAction(id: string): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA === "true") {
    const staff = mockStaff.find((s) => s.id === id);
    if (!staff) {
      return { success: false, error: "Staff not found." };
    }

    if (staff.isActive) {
      return { success: false, error: "Staff member is already active." };
    }

    staff.isActive = true;
    return { success: true };
  }

  return { success: false, error: "DB not connected" };
}
