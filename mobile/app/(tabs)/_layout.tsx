import { Tabs } from "expo-router";
import { Text, View } from "react-native";
import { colors, fonts } from "@/lib/theme";

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text
      style={{
        fontFamily: focused ? fonts.bodySemi : fonts.body,
        fontSize: 11,
        color: focused ? colors.ink : colors.textMuted,
        letterSpacing: 0.3,
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
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingTop: 8,
          paddingBottom: 10,
        },
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarBackground: () => (
          <View style={{ flex: 1, backgroundColor: colors.surface }} />
        ),
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
          tabBarLabel: ({ focused }) => <TabLabel label="Wardrobe" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="studio"
        options={{
          title: "Studio",
          tabBarLabel: ({ focused }) => <TabLabel label="Studio" focused={focused} />,
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
