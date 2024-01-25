---
title: "Effective Java - 아이템 25: 로 타입은 사용하지 말라"
categories:
  - Effective Java
tags:
  - Effective Java
toc: true
toc_sticky: true
toc_label: ""
toc_icon: ""
---

### 제네릭
클래스와 인터페이스 선언에 **타입 매개변수(type parameter)**가 쓰이면, 이를 **제네릭 클래스** 혹은 **제네릭 인터페이스**라 한다.
제네릭 클래스와 제네릭 인터페이스를 통틀어 **제네릭 타입(generic type)**이라 한다.

각각의 제네릭 타입은 일련의 **매개변수화 타입(parameterized type)**을 정의한다.
제네릭 타입을 하나 정의하면 그에 딸리 **로 타입(raw type)**도 함께 정의된다.
로 타입이란 제네릭 타입에서 타입 매개변수를 전혀 사용하지 않을 때를 말한다.

```java
// 컬렉션의 로 타입
// Stamp 인스턴스만 취급한다.
private final Collection stamps = ...;
```

이 코드는 Stamp 인스턴스 대신 다른 타입의 객체를 넣어도 아무 오류 없이 컴파일되고 실행된다.
컬렉션에서 다른 타입의 객체를 꺼내기 전에는 오류를 알아차리지 못한다.

```java
// 반복자 로 타입
for (Iterator i = stamps.iterator(); i.hasNext(); ) {
Stamp stamp = (Stamp) i.next(); // ClassCastException을 던진다.
        stamp.cancel();
}
```

오류는 가능한 한 발생 즉시, 이상적으로는 컴파일할 때 발견하는 것이 좋다.
이 예에서는 오류가 발생하고 한참 뒤인 런타임에야 알아챌 수 있는데, 이렇게 되면 런타임에 문제를 겪는 코드와
원인을 제공한 코드가 물리적으로 상당히 떨어져 있을 가능성이 커진다.

```java
// 매개변수화된 컬렉션 타입 - 타입 안정성 확보
private final Collection<Stamp> stamps = ...;
```

이렇게 선언하면 컴파일러는 stamps에는 Stamp의 인스턴스만 넣어야 함을 컴파일러가 인지하게 된다.
따라서 아무런 경고 없이 컴파일된다면 의도대로 동작할 것임을 보장한다.
컴파일러는 컬렉션에서 원소를 꺼내는 모든 곳에 보이지 않는 형변환을 추가하여 절대 실패하지 않음을 보장한다.

### 로 타입을 사용하면 안되는 이유
로타입을 쓰면 제네릭이 안겨주는 안전성과 표현력을 모두 잃게 된다.
List 같은 로 타입은 사용해서는 안 되나, List<Object>처럼 임의 객체를 허용하는 매개변수화 타입은 괜찮다.
List는 제네릭 타입에서 완전히 발을 뺀 것이고, List<Object>는 모든 타입을 허용한다는 의사를 컴파일러에 명확히 전달한 것이다.
매개변수로 List를 받는 메서드에 List<String>을 넘길 수 있지만, List<Object>를 받는 메서드에는 넘길 수 없다.
이는 제네릭의 하위 타입 규칙 때문이다. 즉, List,String>은 로 타입인 List의 하위 타입이지만, List<Object>의 하위 타입은 아니다.
List<Object> 같은 매개변수화 타입을 사용할 때와 달리 List 같은 로 타입을 사용하면 타입 안전성을 잃게 된다.

```java
// 잘못된 예 - 모르는 타입의 원소도 받는 로 타입을 사용했다.
static int numElementsInCommon(Set s1, Set s2) {
    int result = 0;
    for (Object o1 : s1) {
        if (s2.contains(o1)) {
            result++;
        }
    }
    return result;
}
```

이 메서드는 동작은 하지만 로 타입을 사용해 안전하지 않다.
따라서 **비한정적 와일드카드 타입(unbounded wildcard type)**을 대신 사용하는 게 좋다.
제네릭 타입을 쓰고 싶지만 실제 타입 매개변수가 무엇인지 신경 쓰고 싶지 않다면 **물음표(?)**를 사용하자.
예컨데 제네릭 타입인 Set<E>의 비한정적 와일드 카드 타입은 Set<?>다.
이것이 **어떤 타입이라도 담을 수 있는 가장 범용적인 매개변수화 Set 타입**이다.

```java
// 비한정적 와일드카드 타입 사용 - 타입 안전하며 유연하다.
static int numElementsInCommon(Set<?> s1, SEt<?> s2) { ... }
```

비한정적 와일드카드 타입인 Set<?>와 로 타입인 Set의 차이는 와일드카드 타입은 안전하고, 로 타입은 안전하지 않다.
로 타입 컬렉션에는 아무 원소나 넣을 수 있으니 타입 불변식을 훼손하기 쉽다.
반면, Collection<?>에는 (null 외에는) 어떤 원소도 넣을 수 없다.

### Collection<?>에 null 외에 어떤 원소도 넣을 수 없는 이유
Collection<?>는 제네릭 타입에 와일드카드를 사용한 것으로, 이는 "알 수 없는 타입"을 의미한다. 
따라서 Collection<?>는 **알 수 없는 타입의 객체를 담는 컬렉션**이라는 의미가 된다.
이런 Collection<?>에 대해서는, 안전성을 위해 null 외에는 어떤 객체도 추가할 수 없도록 제한하고 있다. 
이는 Collection<?>가 어떤 타입의 객체를 담고 있는지 알 수 없기 때문인데, 예를 들어 Collection<String>일 수도 있고, Collection<Integer>일 수도 있다.
이렇게 Collection<?>에 어떤 타입의 객체를 추가하면 컴파일 타임에 타입 안정성을 보장할 수 없으므로, 자바는 이를 허용하지 않는다.

하지만 Collection<?>에서 데이터를 읽는 것은 가능하다. 
왜냐하면 모든 클래스는 Object 클래스를 상속받기 때문에, Collection<?>에서 읽어낸 데이터는 항상 Object 타입으로 처리할 수 있기 때문이다.
요약하자면, Collection<?>는 어떤 타입의 객체도 추가할 수 없지만 읽기는 가능하며, 이는 다양한 종류의 컬렉션에 대해 일관되게 작동하는 메서드를 작성할 때 유용하게 사용된다. 
이런 메서드들은 컬렉션에 데이터를 추가하지 않고, 컬렉션에서 데이터를 읽어 처리하는 데에 적합하다.

```java
public static void main(String[] args) {
    Collection<Integer> intCollection = Arrays.asList(1, 2, 3, 4, 5);
    printCollection(intCollection);

    Collection<String> stringCollection = Arrays.asList("one", "two", "three");
    printCollection(stringCollection);
}

public static void printCollection(Collection<?> collection) {
    for (Object item : collection) {
        System.out.println(item);
    }
}
```

위 코드에서 printCollection 메서드는 Collection<?>형식의 파라미터를 받아서, 그 컬렉션의 각 요소를 출력한다. 
이 메서드는 어떤 타입의 컬렉션이든 처리할 수 있기 때문에, Collection<Integer>와 Collection<String> 모두에게 사용될 수 있다.
하지만 이 메서드 내부에서 컬렉션에 새로운 요소를 추가하려고 하면, 컴파일 에러가 발생한다. 
왜냐하면 'Collection<?>'에는 null 외에 아무것도 추가할 수 없기 때문이다.

### 로 타입을 사용하는 예외
첫 번째 예외로 class 리터럴에는 로 타입을 써야 한다.
자바 명세는 class 리터럴에 매개변수화 타입을 사용하지 못하게 했다(배열과 기본 타입은 허용한다).
에를 들어 List.class, String[].class, int.class는 허용하고 List<String>.class와 List<?>.class는 허용하지 않는다.

두 번째 에외는 instanceof 연산자와 관련이 있다. 
런타임에는 제네릭 타입 정보가 지워지므로 instanceof 연산자는 비한정적 와일드카드 타입 이외의 매개변수화 타입에는 적용할 수 없다.
그리고 로 타입이든 비한정적 와일드카드 타입이든 instanceof는 완전히 똑같이 동작한다.

```java
// 로 타입을 써도 좋은 예 - instanceof 연산자
if (o instanceof Set) { // 로 타입
    Set<?> s = (Set<?>) o; // 와일드카드 타입
}

// o의 타입이 Set임을 확인한 다음 와일드카드 타입인 Set<?>로 형변환해야 한다. 이는 검사 형변환이므로 컴파일러 경고가 뜨지 않는다.
```

### 핵심 정리
로 타입을 사용하면 런타임에 예외가 일어날 수 있으니 사용하면 안 된다.
Set<Object>는 어떤 타입의 객체도 저장할 수 있는 매개변수화 타입이고, Set<?>는 모종의 타입 객체만 저장할 수 있는 와일드카드 타입이다.
그리고 이들의 로 타입인 Set은 제네릭 타입 시스템에 속하지 않는다. 
Set<Object>와 Set<?>는 안전하지만, 로 타입인 Set은 안전하지 않다.
