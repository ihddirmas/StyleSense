import { Tabs } from "expo-router";
import { Text } from "react-native";
import { colors } from "@/lib/theme";

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text
      style={{
        fontFamily: focused ? "PublicSans_600SemiBold" : "PublicSans_400Regular",
        fontSize: 11,
        color: focused ? colors.accentSoft : colors.textDim,
      }}
    >
      {label}
    </Text>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bgElevated,
          borderTopColor: colors.border,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: colors.accentSoft,
        tabBarInactiveTintColor: colors.textDim,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarLabel: ({ focused }) => <TabLabel label="Home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="wardrobe"
        options={{
          title: "Wardrobe",
          tabBarLabel: ({ focused }) => <TabLabel label="Closet" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="studio"
        options={{
          title: "Studio",
          tabBarLabel: ({ focused }) => <TabLabel label="Try-On" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="stylist"
        options={{
          title: "Aria",
          tabBarLabel: ({ focused }) => <TabLabel label="Aria" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="paywall"
        options={{
          title: "Upgrade",
          tabBarLabel: ({ focused }) => <TabLabel label="Upgrade" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
