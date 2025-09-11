import { useEffect, useState } from "react";
import { View, Text, FlatList, Image } from "react-native";
import { auth, db } from "../firebase";
import { collection, onSnapshot } from "firebase/firestore";

export default function NFTScreen(){
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    if (!auth.currentUser) return;
    const c = collection(db, "users", auth.currentUser.uid, "nfts");
    const unsub = onSnapshot(c, qs => setItems(qs.docs.map(d=>({ id: d.id, ...(d.data() as any) }))));
    return () => unsub();
  }, []);
  return (
    <View style={{ padding: 24, gap: 12, flex:1 }}>
      <Text style={{ fontWeight:"700", fontSize:18 }}>My NFTs</Text>
      <FlatList
        data={items}
        keyExtractor={(i)=>i.id}
        renderItem={({item}) => (
          <View style={{ flexDirection:"row", gap:12, alignItems:"center", paddingVertical:8 }}>
            {item.image && <Image source={{ uri: item.image }} style={{ width:48, height:48, borderRadius:8 }} />}
            <View>
              <Text>{item.name || item.id}</Text>
              <Text style={{ color:"#666" }}>{item.collection || "Collection"}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={{ color:"#666" }}>No NFTs yet</Text>}
      />
    </View>
  );
}
