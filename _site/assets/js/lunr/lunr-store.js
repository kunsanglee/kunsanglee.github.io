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
      },{
        "title": "객체지향 변경에 유연한 코드 리팩토링",
        "excerpt":"리팩토링 전 코드는 크게 두 가지 기능으로 영화관에서 관람객이 티켓을 구매하거나 초대권을 사용하여 입장, 카페에서 고객이 캐셔에게 음료 주문을 하여 바리스타가 주문을 바탕으로 음료를 만들어주는 기능을 하는 코드였다. 하지만 기능이 동작하는 것과 별개로 각 객체들이 너무 많은 범위의 책임을 가지고 있었고, 클래스 간의 관계가 강하게 결합되어있어 확장이 어렵고 코드를 읽는...","categories": ["Java"],
        "tags": ["객체지향","SOLID","Refactor"],
        "url": "http://localhost:4000/java/%EB%B3%80%EA%B2%BD%EC%97%90-%EC%9C%A0%EC%97%B0%ED%95%9C-%EC%BD%94%EB%93%9C-%EB%A6%AC%ED%8C%A9%ED%86%A0%EB%A7%81/",
        "teaser": null
      },{
        "title": "TDD 학점 계산기 만들기",
        "excerpt":"학점을 구하는 방법 = (교과목 학점 + 평점)의 합 / 수강신청 총 학점 수. 객체지향 설계 및 구현 도메인을 구성하는 객체에는 어떤 것들이 있는지 고민. 객체들 간의 관계를 고민. 동적인 객체를 정적인 타입으로 추상화하여 도메인 모델링. 협력을 설계. 객체들을 포괄하는 타입에 적절한 책임을 할당. 구현. 1. 도메인을 구성하는 객체에는 어떤...","categories": ["Java"],
        "tags": ["객체지향","일급 컬렉션","TDD","Refactor"],
        "url": "http://localhost:4000/java/%ED%95%99%EC%A0%90-%EA%B3%84%EC%82%B0%EA%B8%B0-%EB%A7%8C%EB%93%A4%EA%B8%B0/",
        "teaser": null
      }]
