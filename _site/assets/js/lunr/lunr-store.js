var store = [{
        "title": "Object.requireNonNull(), Map -  getOrDefault (), compute(), computeIfAbsent()",
        "excerpt":"// 개선 전 // friend는 [[\"json\", \"john\"], [\"john\", \"mike\"]...] 이런 데이터가 담긴 List이다. private static Map&lt;String, List&lt;String&gt;&gt; makeFriendRelation(List&lt;List&lt;String&gt;&gt; friends) { HashMap&lt;String, List&lt;String&gt;&gt;friendsRelation = new HashMap&lt;&gt;(); for (List&lt;String&gt; friendPair:friends) { Objects.requireNonNull(friendsRelation.put(friendPair.get(FRIEND_A),new ArrayList&lt;&gt;())) .add(friendPair.get(FRIEND_B)); Objects.requireNonNull(friendsRelation.put(friendPair.get(FRIEND_B),new ArrayList&lt;&gt;())) .add(friendPair.get(FRIEND_A)); } return friendsRelation; } makeFriendRelation() 메서드는 friends 리스트에 담긴 친구관계를 Map&lt;String, List&lt;String&gt;&gt; 타입으로 담아서 반환하려는...","categories": ["Java"],
        "tags": ["Data Structure","Solution"],
        "url": "http://localhost:4000/java/Object.requireNonNull()-Map-getOrDefault()-compute()-computeIfAbsent()/",
        "teaser": null
      },{
        "title": "자료구조 contains(), add()",
        "excerpt":"isValidDuplicated 메서드는 친구관계를 나타내는 friends 리스트에서 [[”json”, “john”], [”john”, “json”]] 과 같이 중복되는 친구관계가 담겨있는지 확인하는 메서드이다. // 개선 전 // friend는 [[\"json\", \"john\"], [\"john\", \"mike\"]...] 이런 데이터가 담긴 List이다. private static boolean isValidDuplicated(List&lt;List&lt;String&gt;&gt; friends) { Set&lt;List&lt;String&gt;&gt; uniqueFriends = new HashSet&lt;&gt;(); for (List&lt;String&gt; friendPair : friends) { if (uniqueFriends.contains(friendPair) ||...","categories": ["Java"],
        "tags": ["Data Structure","Solution"],
        "url": "http://localhost:4000/java/%EC%9E%90%EB%A3%8C%EA%B5%AC%EC%A1%B0-contains()-add()/",
        "teaser": null
      }]
