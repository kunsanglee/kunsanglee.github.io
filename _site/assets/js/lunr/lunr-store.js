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
      },{
        "title": "String, StringBuffer, StringBuilder",
        "excerpt":"String String 클래스는 불변(Immutable)한 문자열을 나타낸다. 한 번 문자열 리터럴이 생성되면 수정할 수 없다. Java에서는 String Constant Pool 또는 상수풀(Constant Pool)이라고 하는 문자열 리터럴을 관리하는 특별한 메모리 영역으로, JVM 내부에 존재하며 문자열 리터럴을 저장하고 재사용하는 역할을 한다. 문자열 리터럴이란? 문자열 리터럴은 소스코드에서 문자열 값을 표현하는 고정된 문자열이다. Constant Pool의 특징...","categories": ["Java"],
        "tags": ["String","StringBuffer","StringBuilder"],
        "url": "http://localhost:4000/java/String-StringBuffer-StringBuilder/",
        "teaser": null
      }]
